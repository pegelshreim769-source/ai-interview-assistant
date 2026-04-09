"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PracticeLayout } from "../components/practice-layout";
import {
  getLatestInProgressSession,
  getMockSessionById,
  readMockSessions,
  readRecognitionLanguage,
  type InterviewMessage,
  type InterviewState,
  type MockInterviewSession,
  type RecognitionLanguage,
  type RoundSummary,
  upsertMockSession,
  writeRecognitionLanguage
} from "../lib/mock-interview-storage";

type MockInterviewResponse = {
  mode: "ask_question" | "ask_followup" | "round_summary";
  interviewer_message: string;
  short_feedback: string;
  summary: RoundSummary | null;
};

type TranscribeResponse = {
  text: string;
  error?: string;
};

const WAITING_FOR_ANSWER_MESSAGE = "面试官已提问完毕，现在请开始回答。";
const REVIEW_ANSWER_MESSAGE = "语音已经转成文字。确认无误后提交，或重新录音。";
const REVIEW_ANSWER_FALLBACK_MESSAGE = "这次自动转写不完整，你可以直接修改文字后提交，或重新录音。";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function mergePcmChunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });

  return merged;
}

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (outputSampleRate >= inputSampleRate) return buffer;

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let index = offsetBuffer; index < nextOffsetBuffer && index < buffer.length; index += 1) {
      accum += buffer[index];
      count += 1;
    }

    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-svg">
      <path
        d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75V7a3.75 3.75 0 1 0-7.5 0v4.5A3.75 3.75 0 0 0 12 15.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.75 11.5a6.25 6.25 0 1 0 12.5 0M12 17.75V21M9 21h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InterviewAvatar() {
  return (
    <div className="mock-avatar-art" aria-hidden="true">
      <div className="mock-avatar-head" />
      <div className="mock-avatar-body" />
    </div>
  );
}

function VoiceWave({ level }: { level: number }) {
  const bars = [0.32, 0.54, 0.8, 1, 0.8, 0.54];

  return (
    <div className="voice-wave" aria-hidden="true">
      {bars.map((scale, index) => {
        const height = 8 + Math.max(4, Math.round(level * 28 * scale));
        return <span key={`${scale}-${index}`} style={{ height }} />;
      })}
    </div>
  );
}

function ThinkingPulse() {
  return (
    <div className="mock-thinking-status" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function statusLabel(state: InterviewState) {
  switch (state) {
    case "idle":
      return "准备开始";
    case "ai_asking":
      return "面试官正在发问";
    case "waiting_for_answer":
      return "等待你回答";
    case "user_recording":
      return "你正在回答";
    case "transcribing":
      return "正在转写";
    case "reviewing_answer":
      return "确认回答";
    case "ai_thinking":
      return "面试官正在判断";
    case "ai_followup":
      return "继续追问";
    case "round_summary":
      return "本轮小结";
    default:
      return "练习中";
  }
}

export default function MockInterviewPage() {
  const [sessionId, setSessionId] = useState("");
  const [interviewState, setInterviewState] = useState<InterviewState>("idle");
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);
  const [followupCount, setFollowupCount] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [transcribedAnswer, setTranscribedAnswer] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [recognitionLanguage, setRecognitionLanguage] = useState<RecognitionLanguage>("zh-CN");
  const [historyItems, setHistoryItems] = useState<MockInterviewSession[]>([]);
  const [error, setError] = useState("");

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const inputSampleRateRef = useRef(44100);
  const isRecordingRef = useRef(false);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const stopReasonRef = useRef<"manual" | "timeout" | "cancel" | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  const lastUserAnswer = useMemo(() => [...messages].reverse().find((message) => message.role === "user" && message.kind === "answer")?.content ?? "", [messages]);

  function loadSessions() {
    setHistoryItems(readMockSessions());
  }

  function persistSession(nextStatus?: MockInterviewSession["status"]) {
    if (!sessionId) return;

    const existingSession = readMockSessions().find((item) => item.session_id === sessionId);

    const session: MockInterviewSession = {
      session_id: sessionId,
      mode: "mock_interview",
      created_at: existingSession?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: nextStatus || (interviewState === "round_summary" ? "completed" : interviewState === "idle" && !messages.length ? "interrupted" : "in_progress"),
      title: currentQuestion || messages.find((message) => message.role === "assistant" && message.kind === "question")?.content || "产品经理模拟面试",
      current_question: currentQuestion,
      messages,
      summary: roundSummary,
      interview_state: interviewState,
      followup_count: followupCount,
      voice_status: voiceStatus,
      live_transcript: liveTranscript,
      duration_seconds: recordingSeconds,
      recognition_language: recognitionLanguage
    };

    setHistoryItems(upsertMockSession(session));
  }

  function answerReadyState(): InterviewState {
    return currentQuestion ? "waiting_for_answer" : "idle";
  }

  function stopQuestionPlayback() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function moveToWaitingForAnswer(nextMessage = WAITING_FOR_ANSWER_MESSAGE) {
    setInterviewState("waiting_for_answer");
    setVoiceStatus(nextMessage);
  }

  useEffect(() => {
    setRecognitionLanguage(readRecognitionLanguage());
    loadSessions();
  }, []);

  useEffect(() => {
    return () => {
      stopVoiceInput("cancel");
      stopQuestionPlayback();
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    persistSession(interviewState === "round_summary" ? "completed" : "in_progress");
  }, [sessionId, interviewState, messages, currentQuestion, roundSummary, followupCount, voiceStatus, liveTranscript]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeUnload = () => {
      if (sessionId && messages.length) {
        persistSession(interviewState === "round_summary" ? "completed" : "interrupted");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sessionId, messages, interviewState, currentQuestion, roundSummary, followupCount, voiceStatus, liveTranscript, recordingSeconds, recognitionLanguage]);

  function clearRecordingTimers() {
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  }

  function cleanupAudioCapture() {
    isRecordingRef.current = false;

    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    pcmChunksRef.current = [];
  }

  function finalizeVoiceRecording() {
    clearRecordingTimers();
    cleanupAudioCapture();
    recordingStartedAtRef.current = null;
  }

  function cancelPendingAnswer() {
    setLiveTranscript("");
    setTranscribedAnswer("");
  }

  function moveToReviewAnswer(transcript: string, message = REVIEW_ANSWER_MESSAGE) {
    setTranscribedAnswer(transcript);
    setLiveTranscript("");
    setInterviewState("reviewing_answer");
    setVoiceStatus(message);
  }

  async function transcribeAudio(audioBlob: Blob) {
    const extension = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
    const file = new File([audioBlob], `mock-answer.${extension}`, { type: audioBlob.type || "audio/webm" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", recognitionLanguage);

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as TranscribeResponse;

    if (!response.ok) {
      throw new Error(payload.error || "语音转写失败，请稍后再试。");
    }

    return payload.text?.trim() || "";
  }

  async function handleRecordedAudio(audioBlob: Blob) {
    finalizeVoiceRecording();

    if (!audioBlob.size) {
      moveToReviewAnswer("", REVIEW_ANSWER_FALLBACK_MESSAGE);
      setError("这次没有录到有效音频，你可以重新录音，或直接手动输入回答。");
      return;
    }

    try {
      const transcript = await transcribeAudio(audioBlob);

      if (transcript) {
        moveToReviewAnswer(transcript);
        return;
      }

      moveToReviewAnswer("", REVIEW_ANSWER_FALLBACK_MESSAGE);
      setError("这次没有稳定识别出文字，你可以直接手动补充后提交。");
    } catch (transcribeError) {
      moveToReviewAnswer("", REVIEW_ANSWER_FALLBACK_MESSAGE);
      setError(transcribeError instanceof Error ? transcribeError.message : "语音转写失败，请稍后再试。");
    }
  }

  async function startRecordingSession() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      moveToReviewAnswer("", "当前浏览器不支持录音，请直接手动输入回答。");
      setError("当前浏览器不支持录音，请改用 Chrome，或直接手动输入回答。");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const AudioContextConstructor = audioWindow.AudioContext || audioWindow.webkitAudioContext;

      if (!AudioContextConstructor) {
        throw new Error("当前浏览器不支持音频采集。");
      }

      const audioContext = new AudioContextConstructor();
      await audioContext.resume();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);

      inputSampleRateRef.current = audioContext.sampleRate;
      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceNodeRef.current = sourceNode;
      processorNodeRef.current = processorNode;
      pcmChunksRef.current = [];
      stopReasonRef.current = null;
      isRecordingRef.current = true;

      processorNode.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return;
        const channel = event.inputBuffer.getChannelData(0);
        if (channel.length) {
          pcmChunksRef.current.push(new Float32Array(channel));
        }
      };

      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
      return true;
    } catch (recordingError) {
      const message =
        recordingError instanceof DOMException && recordingError.name === "NotAllowedError"
          ? "没有拿到麦克风权限，请允许浏览器访问麦克风。"
          : recordingError instanceof Error && recordingError.message
            ? recordingError.message
            : "没有检测到可用麦克风，请检查系统输入设备后再试。";

      setError(message);
      moveToWaitingForAnswer(WAITING_FOR_ANSWER_MESSAGE);
      finalizeVoiceRecording();
      return false;
    }
  }

  function stopVoiceInput(stopReason: "manual" | "timeout" | "cancel" = "manual") {
    clearRecordingTimers();
    stopReasonRef.current = stopReason;

    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      const mergedPcm = mergePcmChunks(pcmChunksRef.current);
      const targetSampleRate = 16000;
      const output = downsampleBuffer(mergedPcm, inputSampleRateRef.current, targetSampleRate);
      const wavBlob = encodeWav(output, targetSampleRate);

      if (stopReason === "cancel") {
        finalizeVoiceRecording();
        return;
      }

      void handleRecordedAudio(wavBlob);
      return;
    }

    if (stopReason === "cancel") {
      finalizeVoiceRecording();
    } else {
      moveToReviewAnswer("", REVIEW_ANSWER_FALLBACK_MESSAGE);
    }
  }

  async function startInterview() {
    if (sessionId && messages.length && interviewState !== "round_summary") {
      persistSession("interrupted");
    }

    const nextSessionId = createId("mock-session");
    setError("");
    setSessionId(nextSessionId);
    setInterviewState("ai_thinking");
    setMessages([]);
    setCurrentQuestion("");
    setRoundSummary(null);
    setFollowupCount(0);
    setTranscribedAnswer("");
    setLiveTranscript("");
    setVoiceStatus("");
    setRecordingSeconds(0);
    stopQuestionPlayback();

    try {
      const response = await fetch("/api/mock-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" })
      });

      const payload = (await response.json()) as MockInterviewResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "模拟面试启动失败，请稍后再试。");
      }

      const assistantMessages: InterviewMessage[] = [
        {
          id: createId("assistant"),
          role: "assistant",
          kind: "question",
          content: payload.interviewer_message
        }
      ];
      setCurrentQuestion(payload.interviewer_message);
      setMessages(assistantMessages);
      moveToWaitingForAnswer();
      setHistoryItems(() =>
        upsertMockSession({
          session_id: nextSessionId,
          mode: "mock_interview",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: "in_progress",
          title: payload.interviewer_message || "产品经理模拟面试",
          current_question: payload.interviewer_message,
          messages: assistantMessages,
          summary: null,
          interview_state: "waiting_for_answer",
          followup_count: 0,
          voice_status: WAITING_FOR_ANSWER_MESSAGE,
          live_transcript: "",
          duration_seconds: 0,
          recognition_language: recognitionLanguage
        })
      );
    } catch (requestError) {
      setSessionId("");
      setInterviewState("idle");
      setError(requestError instanceof Error ? requestError.message : "模拟面试启动失败，请稍后再试。");
    }
  }

  async function submitAnswer(transcript: string) {
    const nextUserMessage: InterviewMessage = {
      id: createId("user"),
      role: "user",
      kind: "answer",
      content: transcript
    };

    const nextHistory = [...messages, nextUserMessage];
    setMessages(nextHistory);
    setInterviewState("ai_thinking");
    setVoiceStatus("正在根据这一轮回答判断要继续追问，还是先帮你收住这一轮。");
    setTranscribedAnswer(transcript);
    setError("");

    try {
      const response = await fetch("/api/mock-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          history: nextHistory.map(({ role, kind, content }) => ({ role, kind, content })),
          followupCount
        })
      });

      const payload = (await response.json()) as MockInterviewResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "这一轮处理失败，请稍后再试。");
      }

      if (payload.mode === "ask_followup") {
        const assistantTurn: InterviewMessage = {
          id: createId("assistant"),
          role: "assistant",
          kind: "question",
          content: payload.interviewer_message
        };

        setMessages((current) => [
          ...current,
          ...(payload.short_feedback
            ? [
                {
                  id: createId("assistant"),
                  role: "assistant" as const,
                  kind: "feedback" as const,
                  content: payload.short_feedback
                }
              ]
            : []),
          assistantTurn
        ]);
        setCurrentQuestion(payload.interviewer_message);
        moveToWaitingForAnswer();
        setFollowupCount((current) => current + 1);
        return;
      }

      const summary = payload.summary;
      const appendedMessages: InterviewMessage[] = [];

      if (payload.interviewer_message) {
        appendedMessages.push({
          id: createId("assistant"),
          role: "assistant",
          kind: "feedback",
          content: payload.interviewer_message
        });
      }

      if (payload.short_feedback) {
        appendedMessages.push({
          id: createId("assistant"),
          role: "assistant",
          kind: "feedback",
          content: payload.short_feedback
        });
      }

      setMessages((current) => [...current, ...appendedMessages]);
      setRoundSummary(summary);
      setCurrentQuestion("");
      setInterviewState("round_summary");
      setVoiceStatus("这一轮先收到这里，我已经帮你整理出一个阶段小结。");
      persistSession("completed");
    } catch (requestError) {
      setMessages((current) => current.filter((message) => message.id !== nextUserMessage.id));
      setInterviewState("reviewing_answer");
      setVoiceStatus("这段回答我已经保留了。服务恢复后，你可以直接重新提交。");
      setError(requestError instanceof Error ? requestError.message : "这一轮处理失败，请稍后再试。");
    }
  }

  async function handleRecordToggle() {
    if (interviewState === "ai_thinking" || interviewState === "transcribing" || interviewState === "round_summary" || interviewState === "reviewing_answer") return;

    if (interviewState === "user_recording") {
      setInterviewState("transcribing");
      setVoiceStatus("正在整理这段回答…");
      stopVoiceInput("manual");
      return;
    }

    if (interviewState !== "waiting_for_answer") {
      setVoiceStatus(WAITING_FOR_ANSWER_MESSAGE);
      return;
    }

    stopQuestionPlayback();
    setError("");
    cancelPendingAnswer();
    setVoiceStatus(
      "正在录音，你可以像真实面试一样把这一段完整说完。"
    );
    setRecordingSeconds(0);
    setInterviewState("user_recording");
    setLiveTranscript("");
    recordingStartedAtRef.current = Date.now();

    recordingIntervalRef.current = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      const elapsedSeconds = startedAt ? (Date.now() - startedAt) / 1000 : 0;

      if (elapsedSeconds >= 300) {
        setRecordingSeconds(300);
        setInterviewState("transcribing");
        setVoiceStatus("已到 5 分钟，正在整理这段回答…");
        stopVoiceInput("timeout");
        return;
      }

      setRecordingSeconds(elapsedSeconds);
    }, 250);

    recordingTimeoutRef.current = window.setTimeout(() => {
      setInterviewState("transcribing");
      setVoiceStatus("已到 5 分钟，正在整理这段回答…");
      stopVoiceInput("timeout");
    }, 300000);

    const started = await startRecordingSession();

    if (!started) {
      clearRecordingTimers();
      return;
    }
  }

  async function submitReviewedAnswer() {
    const transcript = transcribedAnswer.trim();
    if (!transcript) {
      setError("请先确认转写结果，或重新录音。");
      return;
    }

    setError("");
    await submitAnswer(transcript);
  }

  function redoAnswerRecording() {
    cancelPendingAnswer();
    setRecordingSeconds(0);
    moveToWaitingForAnswer("请重新开始录音，完整说完这一段回答。");
    setError("");
  }

  async function finishRoundNow() {
    if (!messages.some((message) => message.role === "user" && message.kind === "answer")) return;

    setInterviewState("ai_thinking");
    setVoiceStatus("我先把这一轮收一下。");
    setError("");

    try {
      const response = await fetch("/api/mock-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finish",
          history: messages.map(({ role, kind, content }) => ({ role, kind, content })),
          followupCount
        })
      });

      const payload = (await response.json()) as MockInterviewResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "暂时没法完成这一轮小结，请稍后再试。");
      }

      const appendedMessages: InterviewMessage[] = [];

      if (payload.interviewer_message) {
        appendedMessages.push({
          id: createId("assistant"),
          role: "assistant",
          kind: "feedback",
          content: payload.interviewer_message
        });
      }

      if (payload.short_feedback) {
        appendedMessages.push({
          id: createId("assistant"),
          role: "assistant",
          kind: "feedback",
          content: payload.short_feedback
        });
      }

      setMessages((current) => [...current, ...appendedMessages]);
      setRoundSummary(payload.summary);
      setCurrentQuestion("");
      setInterviewState("round_summary");
      setVoiceStatus("这一轮我先帮你收住。");
      persistSession("completed");
    } catch (requestError) {
      setInterviewState(answerReadyState());
      setVoiceStatus(currentQuestion ? "当前服务有点忙，稍后可以继续这一轮，或再试一次结束本轮。" : "");
      setError(requestError instanceof Error ? requestError.message : "暂时没法完成这一轮小结，请稍后再试。");
    }
  }

  function handleNewRound() {
    void startInterview();
  }

  function handleContinueLatest() {
    const session = getLatestInProgressSession();
    if (!session) {
      setError("当前没有可继续的模拟面试");
      return;
    }

    restoreSession(session);
  }

  function restoreSession(session: MockInterviewSession) {
    setSessionId(session.session_id);
    setMessages(Array.isArray(session.messages) ? session.messages : []);
    setCurrentQuestion(session.current_question || "");
    setRoundSummary(session.summary || null);
    setInterviewState(
      session.interview_state === "ai_asking" ||
        session.interview_state === "ai_followup" ||
        session.interview_state === "user_recording" ||
        session.interview_state === "transcribing" ||
        session.interview_state === "reviewing_answer"
        ? "waiting_for_answer"
        : session.interview_state
    );
    setFollowupCount(typeof session.followup_count === "number" ? session.followup_count : 0);
    setVoiceStatus(
      session.current_question && session.interview_state !== "round_summary"
        ? session.interview_state === "ai_thinking"
          ? session.voice_status || "已恢复到上一轮练习。"
          : WAITING_FOR_ANSWER_MESSAGE
        : session.voice_status || "已恢复到上一轮练习。"
    );
    setLiveTranscript(session.live_transcript || "");
    setTranscribedAnswer("");
    setRecordingSeconds(typeof session.duration_seconds === "number" ? session.duration_seconds : 0);
    setRecognitionLanguage(session.recognition_language || "zh-CN");
    setError("");
    stopQuestionPlayback();
  }

  function handleSelectHistory(sessionIdToRestore: string) {
    const session = getMockSessionById(sessionIdToRestore);
    if (!session) {
      setError("这轮历史记录暂时找不到了。");
      return;
    }

    restoreSession(session);
  }

  function handleLanguageChange(event: { target: HTMLSelectElement }) {
    const nextLanguage = event.target.value as RecognitionLanguage;
    setRecognitionLanguage(nextLanguage);
    writeRecognitionLanguage(nextLanguage);
  }

  const canToggleRecording = interviewState === "waiting_for_answer" || interviewState === "user_recording";
  const isVoiceTimingVisible = interviewState === "user_recording" || interviewState === "transcribing";
  const isThinkingState = interviewState === "ai_thinking";
  const waveformLevel = interviewState === "user_recording" ? 0.48 + ((recordingSeconds % 4) * 0.08) / 4 : interviewState === "transcribing" ? 0.28 : 0.08;
  const recordingProgress = Math.min(recordingSeconds / 300, 1);
  const recordButtonLabel =
    interviewState === "user_recording"
      ? "结束录音"
      : interviewState === "transcribing"
        ? "正在转写"
        : interviewState === "reviewing_answer"
          ? "转写已完成"
          : interviewState === "ai_thinking"
            ? "面试官判断中"
            : interviewState === "ai_asking"
              ? "面试官提问中"
              : interviewState === "round_summary"
                ? "本轮已完成"
                : "开始录音";
  const controlMetaLabel =
    interviewState === "user_recording"
      ? "录音中"
      : interviewState === "transcribing"
        ? "转写中"
        : interviewState === "reviewing_answer"
          ? "确认回答"
          : interviewState === "ai_thinking"
            ? "面试官判断中"
            : interviewState === "waiting_for_answer"
              ? "等待回答"
              : "待命中";

  return (
    <PracticeLayout
      mode="mock"
      onNewRound={handleNewRound}
      onContinueLatest={handleContinueLatest}
      historyItems={historyItems.map((item) => ({
        id: item.session_id,
        title: item.title || "产品经理模拟面试",
        updatedAt: item.updated_at,
        status: item.status,
        modeLabel: "模拟面试",
        summary: item.current_question || "按真实面试节奏继续追问"
      }))}
      onSelectHistory={handleSelectHistory}
    >
      <div className="mock-shell">
        <section className="mock-header">
          <div className="mock-header-main">
            <h1 className="mock-title">模拟面试模式</h1>
            <p className="mock-subtitle">我会像真实面试官一样逐轮提问，你用语音回答，我再继续追问。</p>
          </div>
          <div className="mock-language-setting">
            <label htmlFor="recognition-language">识别语言</label>
            <select id="recognition-language" value={recognitionLanguage} onChange={handleLanguageChange}>
              <option value="zh-CN">简体中文</option>
              <option value="zh-TW">繁体中文</option>
              <option value="auto">自动</option>
            </select>
            <p>默认使用简体中文识别。如果总被识别成繁体，请切换到简体中文。</p>
            <p>当前使用 DashScope 语音转写。</p>
          </div>
        </section>

        <section className="mock-stage">
          <div className="mock-interviewer-card">
            <div className="mock-interviewer-meta">
              <div className="mock-avatar">
                <InterviewAvatar />
              </div>
              <div>
                <p className="section-tag">AI 面试官</p>
                <h2>产品经理模拟面试</h2>
                <p>重点看你能不能把背景、动作、判断和结果讲清楚。</p>
              </div>
            </div>

            <div className="mock-status-pill">
              <span className="mock-status-dot" />
              <span>{statusLabel(interviewState)}</span>
            </div>
          </div>

          <div className="mock-question-card">
            <p className="section-tag">当前问题</p>
            <h3>{currentQuestion || "点开始后，我会先抛出第一题。"}</h3>
            <p className={`mock-turn-hint ${interviewState === "waiting_for_answer" ? "is-waiting" : ""}`}>{voiceStatus || "先进入这一轮，再像真实面试一样直接开口答。"}</p>
          </div>

          <div className="mock-conversation">
            {messages.map((message) => (
              <div key={message.id} className={`mock-message ${message.role === "assistant" ? "is-assistant" : "is-user"}`}>
                <p className="mock-message-label">{message.role === "assistant" ? "面试官" : "你的回答"}</p>
                <p className="mock-message-text">{message.content}</p>
              </div>
            ))}

            {liveTranscript && (interviewState === "user_recording" || interviewState === "transcribing") ? (
              <div className="mock-message is-user is-live">
                <p className="mock-message-label">你的回答（转写中）</p>
                <p className="mock-message-text">{liveTranscript}</p>
              </div>
            ) : null}

            {interviewState === "reviewing_answer" ? (
              <div className="mock-message is-user is-reviewing">
                <p className="mock-message-label">你的回答（可修改后提交）</p>
                <textarea
                  className="mock-transcript-editor"
                  value={transcribedAnswer}
                  onChange={(event) => setTranscribedAnswer(event.target.value)}
                  placeholder="这里会显示转写结果，你也可以手动修改后再提交。"
                  rows={6}
                />
              </div>
            ) : null}
          </div>

          <div className="mock-controls">
            <div className="mock-control-main">
              {interviewState === "idle" ? (
                <button className="primary-button" onClick={() => void startInterview()}>
                  开始模拟面试
                </button>
              ) : (
                <button
                  className={`mock-record-button ${interviewState === "user_recording" ? "is-recording" : ""}`}
                  onClick={() => void handleRecordToggle()}
                  disabled={!canToggleRecording}
                >
                  <MicrophoneIcon />
                  <span>{recordButtonLabel}</span>
                </button>
              )}

              {interviewState === "reviewing_answer" ? (
                <>
                  <button className="primary-button" onClick={() => void submitReviewedAnswer()}>
                    提交回答
                  </button>
                  <button className="secondary-button" onClick={() => redoAnswerRecording()}>
                    重新录音
                  </button>
                </>
              ) : null}

              {interviewState !== "idle" ? (
                <button
                  className="secondary-button"
                  onClick={() => void finishRoundNow()}
                  disabled={interviewState === "user_recording" || interviewState === "transcribing" || interviewState === "ai_thinking" || interviewState === "reviewing_answer" || !lastUserAnswer}
                >
                  结束本轮
                </button>
              ) : null}

              {interviewState === "round_summary" ? (
                <button className="secondary-button" onClick={() => void startInterview()}>
                  再来一轮
                </button>
              ) : null}
            </div>

            <div className="mock-control-meta">
              {isVoiceTimingVisible ? (
                <>
                  <div className="voice-status-meta">
                    <span className="voice-status-dot" />
                    <span>{controlMetaLabel}</span>
                    <strong>{formatSeconds(recordingSeconds)}</strong>
                  </div>
                  <div className="mock-progress-track" aria-hidden="true">
                    <span
                      className="mock-progress-fill"
                      style={{ width: `${recordingProgress > 0 ? Math.max(recordingProgress * 100, 4) : 0}%` }}
                    />
                  </div>
                  <VoiceWave level={waveformLevel} />
                </>
              ) : isThinkingState ? (
                <>
                  <div className="voice-status-meta is-thinking">
                    <span>{controlMetaLabel}</span>
                  </div>
                  <ThinkingPulse />
                </>
              ) : (
                <>
                  <div className="voice-status-meta">
                    <span className="voice-status-dot" />
                    <span>{controlMetaLabel}</span>
                  </div>
                  <VoiceWave level={waveformLevel} />
                </>
              )}
            </div>

            <p className="mock-note">仅基于你真实回答继续追问和整理表达，不会补编项目经历、数据或结果。</p>
          </div>

          {roundSummary ? (
            <div className="mock-summary-card">
              <div className="reply-block-header">
                <div>
                  <p className="section-tag">本轮小结</p>
                  <h3>这一轮我先帮你收一下</h3>
                </div>
              </div>

              <div className="mock-summary-grid">
                <div className="mock-summary-item">
                  <p className="mock-summary-label">本轮表现概览</p>
                  <p>{roundSummary.overview}</p>
                </div>
                <div className="mock-summary-item">
                  <p className="mock-summary-label">最大问题</p>
                  <p>{roundSummary.biggest_issue}</p>
                </div>
                <div className="mock-summary-item">
                  <p className="mock-summary-label">下一轮建议</p>
                  <p>{roundSummary.next_suggestion}</p>
                </div>
                <div className="mock-summary-item is-practice">
                  <p className="mock-summary-label">更适合开口练的一版</p>
                  <p>{roundSummary.practice_version}</p>
                </div>
              </div>
            </div>
          ) : null}

          {error ? <p className="error-banner">{error}</p> : null}
        </section>
      </div>
    </PracticeLayout>
  );
}
