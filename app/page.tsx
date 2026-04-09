"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PracticeLayout } from "./components/practice-layout";
import { WorkflowSteps } from "./components/workflow-steps";

type AnalysisResult = {
  mode: "ask_followup" | "generate_practice";
  judgement: {
    has_background: boolean;
    has_ownership: boolean;
    has_method: boolean;
    has_result: boolean;
    clarity_level: "high" | "medium" | "low";
  };
  reason: string;
  score: {
    value: number;
    tier: string;
    summary: string;
  };
  main_issue: string;
  follow_up_questions: string[];
  actionable_suggestions: string[];
  practice_version: string;
};

type UserTurn = {
  id: string;
  role: "user";
  kind: "initial" | "supplement";
  content: string;
};

type AssistantTurn = {
  id: string;
  role: "assistant";
  result: AnalysisResult;
  isStreaming: boolean;
  rawJson: string;
};

type ConversationTurn = UserTurn | AssistantTurn;
type PracticeVersionMode = "default" | "shorter" | "natural";
type WorkflowStatus = "complete" | "current" | "upcoming";

type TranscribeResponse = {
  text: string;
  error?: string;
};

const starterAnswer =
  "我最近负责过一次核心功能改版。当时我们的用户转化率持续下降，我先和产品、数据同学一起拆解漏斗，确认问题集中在新用户首次体验阶段。随后我主导了调研、提出三套优化方案，并推动团队在两周内完成实验。最终首周转化率提升了18%，同时把用户反馈里关于流程复杂的问题降低了30%。这次经历让我意识到，解决问题不能只盯着执行，更要把目标、数据和团队协作串起来。";

const emptyResult: AnalysisResult = {
  mode: "ask_followup",
  judgement: {
    has_background: false,
    has_ownership: false,
    has_method: false,
    has_result: false,
    clarity_level: "low"
  },
  reason: "",
  score: {
    value: 0,
    tier: "",
    summary: ""
  },
  main_issue: "",
  follow_up_questions: [],
  actionable_suggestions: [],
  practice_version: ""
};

function shortenPracticeVersion(text: string) {
  const clean = text.replace(/\n+/g, " ").trim();
  if (clean.length <= 180) return clean;
  return `${clean.slice(0, 180).trim()}...`;
}

function makeMoreNatural(text: string) {
  return text
    .replace(/首先/g, "先")
    .replace(/随后/g, "然后")
    .replace(/最终/g, "最后")
    .replace(/基于这些信息/g, "基于这些判断")
    .trim();
}

function renderBulletLines(lines: string[]) {
  return lines.map((line) => (
    <li key={line} className="reply-bullet">
      {line}
    </li>
  ));
}

function ThinkingIndicator({ label = "正在思考" }: { label?: string }) {
  return (
    <div className="thinking-indicator" aria-live="polite">
      <span className="thinking-label">{label}</span>
      <span className="thinking-dots">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
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

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-svg">
      <path
        d="M12 18V6M12 6l-4.5 4.5M12 6l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VoiceWave({ level }: { level: number }) {
  const bars = [0.35, 0.55, 0.8, 1, 0.8, 0.55];

  return (
    <div className="voice-wave" aria-hidden="true">
      {bars.map((scale, index) => {
        const height = 8 + Math.max(4, Math.round(level * 28 * scale));
        return <span key={`${scale}-${index}`} style={{ height }} />;
      })}
    </div>
  );
}

function getJudgementSummary(result: AnalysisResult) {
  return [
    result.judgement.has_background ? "背景明确" : "背景缺口",
    result.judgement.has_ownership ? "个人动作清楚" : "个人动作不清",
    result.judgement.has_method ? "方法有支撑" : "方法不足",
    result.judgement.has_result ? "结果可验证" : "结果缺失",
    result.judgement.clarity_level === "high" ? "表达清晰" : result.judgement.clarity_level === "medium" ? "表达基本可懂" : "表达偏模糊"
  ];
}

function parseResult(rawJson: string) {
  if (!rawJson.trim()) return emptyResult;

  try {
    return JSON.parse(rawJson) as AnalysisResult;
  } catch {
    return emptyResult;
  }
}

function buildPracticeVersion(result: AnalysisResult, mode: "default" | "shorter" | "natural") {
  const base = result.practice_version.trim();
  if (!base || result.mode !== "generate_practice") return "";
  if (mode === "shorter") return shortenPracticeVersion(base);
  if (mode === "natural") return makeMoreNatural(base);
  return base;
}

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

function mergeVoiceDraft(base: string, finalText: string, interimText = "") {
  const merged = [base.trim(), finalText.trim(), interimText.trim()].filter(Boolean).join(base.trim() ? "\n" : "");
  return merged;
}

function AssistantBubble({
  turn,
  supplementDraft,
  onSupplementChange,
  onContinue,
  disabled
}: {
  turn: AssistantTurn;
  supplementDraft: string;
  onSupplementChange: (value: string) => void;
  onContinue: () => void;
  disabled: boolean;
}) {
  const judgementSummary = useMemo(() => getJudgementSummary(turn.result), [turn.result]);
  const [practiceMode, setPracticeMode] = useState<PracticeVersionMode>("default");
  const practiceVersion = useMemo(() => buildPracticeVersion(turn.result, practiceMode), [turn.result, practiceMode]);
  const localSupplementRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setPracticeMode("default");
  }, [turn.id]);

  useEffect(() => {
    if (turn.result.mode === "ask_followup" && !turn.isStreaming && localSupplementRef.current) {
      localSupplementRef.current.focus();
    }
  }, [turn.result.mode, turn.isStreaming]);

  return (
    <div className="chat-row assistant-row">
      <div className="assistant-avatar">AI</div>
      <div className="assistant-bubble">
        <div className="reply-block">
          <div className="reply-block-header">
            <div>
              <p className="section-tag">这版回答最大的问题</p>
              <p className="module-caption">先抓最影响面试官判断的那个点，而不是先盯分数。</p>
            </div>
          </div>
          <p className="reply-text">
            {turn.result.main_issue || (turn.isStreaming ? "正在提炼这版回答里最容易让面试官卡住的点..." : "通常不是没做过，而是还没把能被判断的信息讲出来。这里会先抓最核心的那个问题。")}
          </p>
        </div>

        <div className="reply-block followup-block">
          <div className="reply-block-header">
            <div>
              <p className="section-tag">面试官下一句大概率会追问什么</p>
              <p className="module-caption">很多时候不是没做过，而是还没把面试官能判断的信息讲出来。我会沿着这个点继续追问。</p>
            </div>
          </div>

          <div className={`followup-layout ${turn.result.mode === "ask_followup" && !turn.isStreaming ? "is-actionable" : ""}`}>
            <div className="followup-questions-panel">
              {turn.result.follow_up_questions.length ? (
                <ul className="reply-list">{renderBulletLines(turn.result.follow_up_questions)}</ul>
              ) : (
                <p className="reply-text">{turn.isStreaming ? "正在整理真实面试里最可能继续追问的问题..." : "这里会出现 2-3 个真实面试官最可能继续追问的问题。"}</p>
              )}

              {turn.result.reason ? (
                <div className="judgement-strip">
                  {judgementSummary.map((item) => (
                    <span className="judgement-pill" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
                ) : null}

            </div>

            {turn.result.mode === "ask_followup" && !turn.isStreaming ? (
              <aside className="followup-side-panel">
                <p className="followup-side-title">把这些真实信息补充给我</p>
                <p className="followup-side-copy">不用写得很完整，把你刚才没来得及讲清的背景、动作和结果补上就行。我会接着这一轮往下练。</p>
                <label className="followup-label" htmlFor={`supplement-${turn.id}`}>
                  你的补充
                </label>
                <textarea
                  ref={localSupplementRef}
                  id={`supplement-${turn.id}`}
                  className="followup-input"
                  value={supplementDraft}
                  onChange={(event) => onSupplementChange(event.target.value)}
                  placeholder="请补充这个项目的具体背景、你个人负责的动作、以及最终结果或验证方式"
                />
                <button className="secondary-button" onClick={onContinue} disabled={disabled || !supplementDraft.trim()}>
                  补充后重新生成
                </button>
              </aside>
            ) : null}
          </div>
        </div>

        <div className="reply-block score-block">
          <div className="reply-block-header">
            <div>
              <p className="section-tag">当前判断</p>
              <p className="module-caption">把分数当成温度计就好，重点还是看清楚这版已经能被判断到什么程度。</p>
            </div>
            <span className="score-badge">{turn.result.score.tier || "正在看"}</span>
          </div>
          {turn.isStreaming ? <ThinkingIndicator /> : null}
          <div className="score-row">
            <strong>{turn.result.score.value || "--"}</strong>
            <span>/ 100</span>
          </div>
          <p className="reply-text">
            {turn.result.score.summary || (turn.isStreaming ? "正在帮你判断这版回答目前大概在哪个水平…" : "我会先告诉你，这一版回答目前大概在哪个水平。")}
          </p>
          {turn.result.reason ? <p className="module-caption">{turn.result.reason}</p> : null}
        </div>

        <div className="reply-block">
          <div className="reply-block-header">
            <div>
              <p className="section-tag">这一轮先这样改</p>
              <p className="module-caption">不用一下全改完，先把最关键的三处调顺。</p>
            </div>
          </div>
          {turn.result.actionable_suggestions.length ? (
            <ul className="reply-list">{renderBulletLines(turn.result.actionable_suggestions)}</ul>
          ) : (
            <p className="reply-text">{turn.isStreaming ? "正在整理下一轮最值得先改的 3 个点..." : "这里会给你最多 3 条能马上用上的建议。"}</p>
          )}
        </div>

        <div className="reply-block practice-block">
          <div className="reply-block-header">
            <div>
              <p className="section-tag">可直接开口练的版本</p>
              <h3>先别急着背，先把这一版读顺。真正面试时，你只需要讲得比现在更清楚一点。</h3>
            </div>
            {practiceVersion ? (
              <div className="practice-variant-switch" role="group" aria-label="练习版本切换">
                {[
                  { value: "default", label: "完整" },
                  { value: "shorter", label: "更短" },
                  { value: "natural", label: "更自然" }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`ghost-button ${practiceMode === option.value ? "is-active" : ""}`}
                    aria-pressed={practiceMode === option.value}
                    onClick={() => setPracticeMode(option.value as PracticeVersionMode)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {turn.result.mode === "ask_followup" ? (
            <div className="practice-warning">
              <p className="reply-text">
                {turn.isStreaming ? "正在判断信息够不够支撑一版可信的练习回答..." : "你还缺少几个关键细节，补充后我再帮你整理成可直接开口练的版本。"}
              </p>
            </div>
          ) : null}

          <div className="practice-body">
            {practiceVersion ? (
              practiceVersion.split("\n").map((paragraph, index) =>
                paragraph.trim() ? (
                  <p className="practice-paragraph" key={`${paragraph}-${index}`}>
                    {paragraph.trim()}
                  </p>
                ) : (
                  <div className="spacer" key={`spacer-${index}`} />
                )
              )
            ) : (
              <p className="reply-text">
                {turn.isStreaming ? "正在判断你提供的信息是否足够支撑一版可信的练习回答..." : "只有在信息足够时，这里才会给你一版可以直接练的回答。"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [draft, setDraft] = useState("");
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [baseAnswer, setBaseAnswer] = useState("");
  const [supplements, setSupplements] = useState<string[]>([]);
  const [pendingSupplementFor, setPendingSupplementFor] = useState<string | null>(null);
  const [supplementDraft, setSupplementDraft] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [error, setError] = useState("");
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const voiceBaseDraftRef = useRef("");
  const voiceRequestIdRef = useRef(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array | null>(null);
  const assistantTurns = useMemo(
    () => conversation.filter((turn): turn is AssistantTurn => turn.role === "assistant"),
    [conversation]
  );
  const latestAssistantTurn = assistantTurns.length ? assistantTurns[assistantTurns.length - 1] : null;
  const needsSupplement = latestAssistantTurn?.result.mode === "ask_followup" || !!pendingSupplementFor;
  const hasPracticeVersion = !!(latestAssistantTurn && buildPracticeVersion(latestAssistantTurn.result, "default"));
  const textWorkflow = useMemo<Array<{ label: string; description: string; status: WorkflowStatus }>>(
    () => [
      {
        label: "说出第一版",
        description: baseAnswer ? "已提交一版真实回答" : "先发你现在会怎么说",
        status: baseAnswer ? "complete" : "current"
      },
      {
        label: "识别卡点",
        description: latestAssistantTurn
          ? "已经抓到这版最容易失分的点"
          : isAnalyzing
            ? "正在看这版回答会卡在哪里"
            : "先看问题和追问方向",
        status: latestAssistantTurn ? "complete" : baseAnswer || isAnalyzing ? "current" : "upcoming"
      },
      {
        label: "补充真实信息",
        description: needsSupplement
          ? "还缺一些背景、动作或结果"
          : latestAssistantTurn
            ? "这轮信息已经够用，或已补充完成"
            : "信息不够时才继续追问",
        status: needsSupplement ? "current" : latestAssistantTurn ? "complete" : "upcoming"
      },
      {
        label: "开口练",
        description: hasPracticeVersion ? "已经生成可直接开口练的版本" : "信息够了再给你练习版",
        status: hasPracticeVersion ? "current" : latestAssistantTurn ? "upcoming" : "upcoming"
      }
    ],
    [baseAnswer, hasPracticeVersion, isAnalyzing, latestAssistantTurn, needsSupplement]
  );

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

  function stopAudioMeter() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    audioDataRef.current = null;
    setAudioLevel(0);
  }

  function resetRecorder() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
      mediaRecorderRef.current = null;
    }

    recordedChunksRef.current = [];
  }

  function finalizeVoiceRecording() {
    clearRecordingTimers();
    setRecordingSeconds(0);
    setIsRecording(false);
    resetRecorder();
    stopAudioMeter();
  }

  async function transcribeAudio(audioBlob: Blob) {
    const extension = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : audioBlob.type.includes("wav") ? "wav" : "webm";
    const file = new File([audioBlob], `practice-answer.${extension}`, { type: audioBlob.type || "audio/webm" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", "zh-CN");

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as TranscribeResponse;

    if (!response.ok) {
      throw new Error(payload.error || "语音转文字出了点问题，请再试一次。");
    }

    return payload.text?.trim() || "";
  }

  async function handleRecordedAudio(audioBlob: Blob) {
    const requestId = ++voiceRequestIdRef.current;
    finalizeVoiceRecording();
    setIsTranscribing(true);

    if (!audioBlob.size) {
      setIsTranscribing(false);
      setError("这次没有录到有效音频，你可以重新录音。");
      setVoiceStatus("这次没有录到有效音频");
      return;
    }

    try {
      const transcript = await transcribeAudio(audioBlob);
      if (requestId !== voiceRequestIdRef.current) return;

      if (!transcript) {
        setError("这次没有稳定识别出文字，你可以再说一遍。");
        setVoiceStatus("这次没有稳定识别出文字");
        return;
      }

      setDraft(mergeVoiceDraft(voiceBaseDraftRef.current, transcript));
      setVoiceStatus("语音已转成文字");
    } catch (voiceError) {
      if (requestId !== voiceRequestIdRef.current) return;
      setError(voiceError instanceof Error ? voiceError.message : "语音转文字出了点问题，请再试一次。");
      setVoiceStatus("语音转文字出了点问题");
    } finally {
      if (requestId === voiceRequestIdRef.current) {
        setIsTranscribing(false);
      }
    }
  }

  function cancelVoiceInput() {
    voiceRequestIdRef.current += 1;
    clearRecordingTimers();

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;

      if (mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore stop failures during teardown.
        }
      }
    }

    setIsTranscribing(false);
    finalizeVoiceRecording();
  }

  function stopVoiceInput(reason: "manual" | "timeout" = "manual") {
    clearRecordingTimers();
    setIsRecording(false);

    if (!mediaRecorderRef.current) {
      finalizeVoiceRecording();
      return;
    }

    if (reason === "manual") {
      setVoiceStatus("正在整理录音…");
    } else {
      setVoiceStatus("已到 5 分钟，正在整理录音…");
    }

    if (mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
        return;
      } catch {
        finalizeVoiceRecording();
        setIsTranscribing(false);
        setError("语音转文字出了点问题，请再试一次。");
      }
    }
  }

  async function startAudioMeter(stream: MediaStream) {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.85;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    mediaStreamRef.current = stream;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    audioDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      if (!analyserRef.current || !audioDataRef.current) return;

      analyserRef.current.getByteFrequencyData(audioDataRef.current);
      const average = audioDataRef.current.reduce((sum: number, value: number) => sum + value, 0) / audioDataRef.current.length;
      setAudioLevel(Math.min(1, average / 96));
      animationFrameRef.current = window.requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }

  async function startRecordingSession() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器暂不支持麦克风采集。");
    }

    if (typeof MediaRecorder === "undefined") {
      throw new Error("当前浏览器暂不支持语音录制，请改用 Chrome 再试。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    await startAudioMeter(stream);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recordedChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      voiceRequestIdRef.current += 1;
      setIsTranscribing(false);
      finalizeVoiceRecording();
      setError("语音转文字出了点问题，请再试一次。");
      setVoiceStatus("");
    };

    recorder.onstop = () => {
      const audioBlob = new Blob(recordedChunksRef.current, {
        type: recorder.mimeType || mimeType || "audio/webm"
      });
      void handleRecordedAudio(audioBlob);
    };

    mediaRecorderRef.current = recorder;
    recorder.start(250);
  }

  async function handleVoiceToggle() {
    if (isAnalyzing || isTranscribing) return;

    if (isRecording) {
      stopVoiceInput("manual");
      return;
    }

    setError("");
    setVoiceStatus("正在听你说");
    setIsRecording(true);
    setRecordingSeconds(0);
    voiceBaseDraftRef.current = draft.trim();

    try {
      await startRecordingSession();
    } catch (voiceError) {
      finalizeVoiceRecording();
      setVoiceStatus("");
      setError(voiceError instanceof Error ? voiceError.message : "无法打开麦克风，请稍后再试。");
      return;
    }

    recordingIntervalRef.current = window.setInterval(() => {
      setRecordingSeconds((current) => {
        if (current >= 299) {
          stopVoiceInput("timeout");
          return 300;
        }

        return current + 1;
      });
    }, 1000);

    recordingTimeoutRef.current = window.setTimeout(() => {
      stopVoiceInput("timeout");
    }, 300000);
  }

  useEffect(() => {
    const textarea = draftRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    return () => {
      cancelVoiceInput();
    };
  }, []);

  async function streamAnalysis(answer: string, supplementText: string, userTurn: UserTurn) {
    const assistantId = createId("assistant");
    setConversation((current) => [...current, userTurn, { id: assistantId, role: "assistant", result: emptyResult, isStreaming: true, rawJson: "" }]);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, supplement: supplementText })
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "分析生成失败，请稍后再试。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          let eventName = "message";
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }

          const data = dataLines.join("\n");

          if (eventName === "chunk") {
            const payload = JSON.parse(data) as { content: string };
            setConversation((current) =>
              current.map((turn) =>
                turn.role === "assistant" && turn.id === assistantId
                  ? {
                      ...turn,
                      rawJson: turn.rawJson + payload.content,
                      result: parseResult(turn.rawJson + payload.content)
                    }
                  : turn
              )
            );
          }

          if (eventName === "error") {
            const payload = JSON.parse(data) as { error: string };
            throw new Error(payload.error);
          }
        }
      }

      setConversation((current) =>
        current.map((turn) =>
          turn.role === "assistant" && turn.id === assistantId
            ? {
                ...turn,
                isStreaming: false,
                result: parseResult(turn.rawJson)
              }
            : turn
        )
      );
    } catch (requestError) {
      setConversation((current) => current.filter((turn) => !(turn.role === "assistant" && turn.id === assistantId)));
      throw requestError;
    }
  }

  async function handleInitialSubmit(nextDraft?: string) {
    const content = (nextDraft ?? draft).trim();
    if (!content || isAnalyzing || isTranscribing) {
      if (!content) setError("请先输入一段面试回答。");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setBaseAnswer(content);
    setSupplements([]);
    setPendingSupplementFor(null);
    setSupplementDraft("");
    setDraft("");
    setVoiceStatus("");
    setConversation([]);
    if (isRecording) cancelVoiceInput();

    try {
      const userTurn: UserTurn = {
        id: createId("user"),
        role: "user",
        kind: "initial",
        content
      };

      await streamAnalysis(content, "", userTurn);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "分析生成失败，请稍后再试。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSupplementSubmit(targetAssistantId: string) {
    const content = supplementDraft.trim();
    if (!content || isAnalyzing || !baseAnswer) return;

    const nextSupplements = [...supplements, content];
    const mergedSupplement = nextSupplements.join("\n\n");

    setIsAnalyzing(true);
    setError("");
    setPendingSupplementFor(null);
    setSupplementDraft("");
    setSupplements(nextSupplements);

    try {
      const userTurn: UserTurn = {
        id: createId("user"),
        role: "user",
        kind: "supplement",
        content
      };

      await streamAnalysis(baseAnswer, mergedSupplement, userTurn);
    } catch (requestError) {
      setSupplements((current) => current.slice(0, -1));
      setPendingSupplementFor(targetAssistantId);
      setSupplementDraft(content);
      setError(requestError instanceof Error ? requestError.message : "分析生成失败，请稍后再试。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleTryExample() {
    setDraft(starterAnswer);
    void handleInitialSubmit(starterAnswer);
  }

  function handleNewRound() {
    if (isRecording || isTranscribing) {
      cancelVoiceInput();
    }
    setDraft("");
    setConversation([]);
    setBaseAnswer("");
    setSupplements([]);
    setPendingSupplementFor(null);
    setSupplementDraft("");
    setIsAnalyzing(false);
    setIsTranscribing(false);
    setVoiceStatus("");
    setError("");
  }

  function handleDraftKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleInitialSubmit();
    }
  }

  return (
    <PracticeLayout mode="text" onTryExample={handleTryExample} onNewRound={handleNewRound} shortcutsDisabled={isAnalyzing}>
      <div className="chat-shell">
        <section className="page-hero page-hero-text">
          <div className="page-hero-main">
            <p className="section-tag">文字练习</p>
            <h1 className="page-title">先把这段经历讲顺</h1>
            <p className="header-subtitle">先写你现在会怎么说。我会按真实面试的节奏继续追问，再陪你把它讲顺。</p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-note-title">这轮目标</p>
            <p className="page-hero-note">不是替你把答案写漂亮，而是把背景、动作、判断和结果讲清楚。</p>
          </aside>
        </section>

        <section className="chat-header">
          <WorkflowSteps steps={textWorkflow} />
        </section>

        <section className="chat-thread">
          {conversation.length === 0 ? (
            <div className="empty-thread">
              <div className="assistant-avatar">AI</div>
              <div className="assistant-bubble empty-bubble">
                <p className="empty-state-title">先发一版你真实会说出口的回答。</p>
                <p className="empty-state-copy">如果信息不够，我会继续追问；你补上后，我们再生成新一轮反馈。</p>
              </div>
            </div>
          ) : (
            conversation.map((turn) =>
              turn.role === "user" ? (
                <div className="chat-row user-row" key={turn.id}>
                  <div className="user-bubble">
                    <p className="user-label">{turn.kind === "initial" ? "你现在会怎么回答" : "你补充的真实信息"}</p>
                    <p className="user-text">{turn.content}</p>
                  </div>
                </div>
              ) : (
                <AssistantBubble
                  key={turn.id}
                  turn={turn}
                  supplementDraft={pendingSupplementFor === turn.id ? supplementDraft : ""}
                  onSupplementChange={(value) => {
                    setPendingSupplementFor(turn.id);
                    setSupplementDraft(value);
                  }}
                  onContinue={() => void handleSupplementSubmit(turn.id)}
                  disabled={isAnalyzing || isTranscribing}
                />
              )
            )
          )}
        </section>

        <section className="composer-dock">
          <div className="composer-card">
            <div className="composer-input-shell">
              <textarea
                ref={draftRef}
                className="composer-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleDraftKeyDown}
                placeholder="例如：我最近做过一次首页改版，当时核心问题是新用户转化持续下降……"
              />

              <div className="composer-side-actions">
                <button
                  className={`icon-button ${isRecording ? "is-recording" : ""}`}
                  onClick={() => void handleVoiceToggle()}
                  disabled={isAnalyzing}
                  aria-label={isRecording ? "停止录音" : "开始语音输入"}
                  title={isRecording ? "停止录音" : "开始语音输入"}
                >
                  {isRecording ? "■" : <MicrophoneIcon />}
                </button>
                <button
                  className="icon-button icon-button-send"
                  onClick={() => void handleInitialSubmit()}
                  disabled={isAnalyzing || isRecording || isTranscribing || !draft.trim()}
                  aria-label="发送"
                  title="发送"
                >
                  <SendIcon />
                </button>
              </div>
            </div>

            <div className="composer-footer">
              <span>
                {isRecording
                  ? `语音输入中 ${formatSeconds(recordingSeconds)} / 05:00`
                  : isTranscribing
                    ? "正在转写语音"
                    : draft.trim().length > 0
                      ? `已输入 ${draft.trim().length} 字`
                      : "Enter 发送，Shift + Enter 换行"}
              </span>
              <span>{voiceStatus || "语音最长 5 分钟"}</span>
            </div>

            {isRecording ? (
              <div className="voice-status-row" aria-live="polite">
                <div className="voice-status-meta">
                  <span className="voice-status-dot" />
                  <span>录音中</span>
                  <strong>{formatSeconds(recordingSeconds)}</strong>
                </div>
                <VoiceWave level={audioLevel} />
              </div>
            ) : null}

            {isTranscribing ? <ThinkingIndicator label="正在转写语音" /> : null}
            {isAnalyzing ? <ThinkingIndicator label="正在整理你的回答" /> : null}

            {error ? <p className="error-banner">{error}</p> : null}
          </div>
        </section>
      </div>
    </PracticeLayout>
  );
}
