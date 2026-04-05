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

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onsoundend?: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type MockInterviewResponse = {
  mode: "ask_question" | "ask_followup" | "round_summary";
  interviewer_message: string;
  short_feedback: string;
  summary: RoundSummary | null;
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

function mergeVoiceDraft(finalText: string, interimText = "") {
  return [finalText.trim(), interimText.trim()].filter(Boolean).join("");
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

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const shouldKeepRecordingRef = useRef(false);
  const manualStopRef = useRef(false);
  const recognitionRestartTimerRef = useRef<number | null>(null);
  const recognitionEverStartedRef = useRef(false);
  const voiceFinalTextRef = useRef("");
  const voiceInterimTextRef = useRef("");

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
      if (sessionId && messages.length) {
        persistSession(interviewState === "round_summary" ? "completed" : "interrupted");
      }
      stopVoiceInput("cancel");
      stopQuestionPlayback();
    };
  }, [sessionId, messages, interviewState, currentQuestion, roundSummary, followupCount, voiceStatus, liveTranscript, recordingSeconds, recognitionLanguage]);

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

  function clearRecognitionRestartTimer() {
    if (recognitionRestartTimerRef.current) {
      window.clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }
  }

  function teardownRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.onspeechstart = null;
      recognitionRef.current.onspeechend = null;
      recognitionRef.current.onsoundstart = null;
      recognitionRef.current.onsoundend = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current = null;
    }
  }

  function finalizeVoiceRecording() {
    shouldKeepRecordingRef.current = false;
    clearRecordingTimers();
    clearRecognitionRestartTimer();
    teardownRecognition();
  }

  function cancelPendingAnswer() {
    setLiveTranscript("");
    setTranscribedAnswer("");
  }

  function moveToReviewAnswer(transcript: string, message = REVIEW_ANSWER_MESSAGE) {
    setTranscribedAnswer(transcript);
    setLiveTranscript(transcript);
    setInterviewState("reviewing_answer");
    setVoiceStatus(message);
  }

  function completeLocalRecognition() {
    const transcript = mergeVoiceDraft(voiceFinalTextRef.current, voiceInterimTextRef.current).trim();
    finalizeVoiceRecording();

    if (transcript) {
      moveToReviewAnswer(transcript);
      return;
    }

    moveToReviewAnswer("", REVIEW_ANSWER_FALLBACK_MESSAGE);
    setError("浏览器这次没有稳定识别出文字，你可以直接手动补充后提交。");
  }

  async function startRecognitionSession() {
    const voiceWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;

    if (!Recognition) {
      moveToReviewAnswer("", "当前浏览器不支持自动语音转写，请直接输入回答内容后提交。");
      setError("当前浏览器不支持本地语音转写，请改用 Chrome，或直接手动输入回答。");
      return false;
    }

    const recognition = new Recognition() as SpeechRecognitionLike;
    recognition.continuous = true;
    recognition.interimResults = true;
    if (recognitionLanguage === "zh-CN" || recognitionLanguage === "zh-TW") {
      recognition.lang = recognitionLanguage;
    }

    recognition.onspeechstart = () => {
      recognitionEverStartedRef.current = true;
      setVoiceStatus("正在录音，我会继续听你把这段话说完。");
    };

    recognition.onspeechend = () => {
      if (!shouldKeepRecordingRef.current) return;
      setVoiceStatus("听到你在停顿，我会继续等你把这一段说完。");
    };

    recognition.onsoundstart = () => {
      recognitionEverStartedRef.current = true;
      setVoiceStatus("已经开始收音，你可以继续说。");
    };

    recognition.onsoundend = () => {
      if (!shouldKeepRecordingRef.current) return;
      setVoiceStatus("收音还在继续，我会等你把这一段说完。");
    };

    recognition.onresult = (event) => {
      let interimText = "";
      recognitionEverStartedRef.current = true;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";

        if (result.isFinal) {
          voiceFinalTextRef.current = `${voiceFinalTextRef.current}${transcript}`;
        } else {
          interimText += transcript;
        }
      }

      voiceInterimTextRef.current = interimText;
      setLiveTranscript(mergeVoiceDraft(voiceFinalTextRef.current, interimText));
    };

    recognition.onerror = (event) => {
      if (shouldKeepRecordingRef.current && !manualStopRef.current && (event.error === "no-speech" || event.error === "aborted" || event.error === "network")) {
        setVoiceStatus(recognitionEverStartedRef.current ? "识别短暂中断了，我正在继续监听，请接着说。" : "我正在继续等待你开口，请直接开始回答。");
        return;
      }

      const message =
        event.error === "not-allowed"
          ? "没有拿到麦克风权限，请允许浏览器访问麦克风。"
          : event.error === "audio-capture"
            ? "没有检测到可用麦克风，请检查系统输入设备后再试。"
            : "本地语音识别出了点问题，你可以重新录音，或直接手动编辑回答。";

      setError(message);
      shouldKeepRecordingRef.current = false;
      manualStopRef.current = true;
      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }
    };

    recognition.onend = () => {
      if (shouldKeepRecordingRef.current && !manualStopRef.current) {
        clearRecognitionRestartTimer();
        recognitionRestartTimerRef.current = window.setTimeout(() => {
          if (!shouldKeepRecordingRef.current) return;
          void startRecognitionSession();
        }, 250);
        return;
      }

      manualStopRef.current = false;
      completeLocalRecognition();
    };

    recognitionRef.current = recognition;
    recognition.start();
    return true;
  }

  function stopVoiceInput(stopReason: "manual" | "timeout" | "cancel" = "manual") {
    shouldKeepRecordingRef.current = false;
    manualStopRef.current = stopReason !== "cancel";
    clearRecordingTimers();
    clearRecognitionRestartTimer();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        recognitionRef.current.abort();
      }
      return;
    }

    if (stopReason === "cancel") {
      finalizeVoiceRecording();
    } else {
      completeLocalRecognition();
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
      setInterviewState(answerReadyState());
      setVoiceStatus(currentQuestion ? WAITING_FOR_ANSWER_MESSAGE : "");
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
    shouldKeepRecordingRef.current = true;
    manualStopRef.current = false;
    recognitionEverStartedRef.current = false;
    voiceFinalTextRef.current = "";
    voiceInterimTextRef.current = "";

    recordingIntervalRef.current = window.setInterval(() => {
      setRecordingSeconds((current) => {
        if (current >= 299) {
          setInterviewState("transcribing");
          setVoiceStatus("已到 5 分钟，正在整理这段回答…");
          stopVoiceInput("timeout");
          return 300;
        }

        return current + 1;
      });
    }, 1000);

    recordingTimeoutRef.current = window.setTimeout(() => {
      setInterviewState("transcribing");
      setVoiceStatus("已到 5 分钟，正在整理这段回答…");
      stopVoiceInput("timeout");
    }, 300000);

    const started = await startRecognitionSession();

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
      setVoiceStatus(currentQuestion ? WAITING_FOR_ANSWER_MESSAGE : "");
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
    setMessages(session.messages);
    setCurrentQuestion(session.current_question);
    setRoundSummary(session.summary);
    setInterviewState(
      session.interview_state === "ai_asking" ||
        session.interview_state === "ai_followup" ||
        session.interview_state === "user_recording" ||
        session.interview_state === "transcribing" ||
        session.interview_state === "reviewing_answer"
        ? "waiting_for_answer"
        : session.interview_state
    );
    setFollowupCount(session.followup_count);
    setVoiceStatus(
      session.current_question && session.interview_state !== "round_summary"
        ? session.interview_state === "ai_thinking"
          ? session.voice_status || "已恢复到上一轮练习。"
          : WAITING_FOR_ANSWER_MESSAGE
        : session.voice_status || "已恢复到上一轮练习。"
    );
    setLiveTranscript(session.live_transcript);
    setTranscribedAnswer("");
    setRecordingSeconds(session.duration_seconds);
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
  const waveformLevel = interviewState === "user_recording" ? 0.48 + ((recordingSeconds % 4) * 0.08) / 4 : 0.08;
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
            <p>当前使用浏览器本地识别。</p>
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
              <div className="voice-status-meta">
                <span className="voice-status-dot" />
                <span>{controlMetaLabel}</span>
                <strong>{formatSeconds(recordingSeconds)}</strong>
              </div>
              <VoiceWave level={waveformLevel} />
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
