"use client";

import { useEffect, useMemo, useState } from "react";
import { PracticeLayout } from "../components/practice-layout";
import {
  type CustomInterviewDebugTrace,
  getCustomSessionById,
  getLatestInProgressCustomSession,
  readCustomSessions,
  type CustomInterviewAnswer,
  type CustomInterviewAnswerMethod,
  type CustomInterviewDifficulty,
  type CustomInputMeta,
  type CustomInterviewQuestion,
  type CustomInterviewReview,
  type CustomInterviewSession,
  type CustomInterviewState,
  type CustomInterviewStyle,
  type JdParsed,
  type MatchSummary,
  type ResumeParsed,
  upsertCustomSession
} from "../lib/custom-interview-storage";

type ParseResumeResponse = {
  resume_parsed: ResumeParsed;
  error?: string;
};

type ParseJdResponse = {
  jd_parsed: JdParsed;
  error?: string;
};

type BuildMatchSummaryResponse = {
  match_summary: MatchSummary;
  error?: string;
};

type ExtractInputResponse = {
  extracted_text: string;
  original_file_name: string;
  parse_source: string;
  error?: string;
};

type RunCustomInterviewResponse = {
  next_question_or_followup: string;
  weak_point: string;
  round_review: CustomInterviewReview | null;
  should_finish: boolean;
  question_index: number;
  total_questions: number;
  debug_trace: CustomInterviewDebugTrace;
  error?: string;
};

const SAMPLE_RESUME = `产品经理｜AI 效率工具

我负责过一款面向内容团队的 AI 写作工具改版。上线前用户留存一般，大家虽然会试用，但很难形成持续使用。

我先和数据同学一起拆解核心路径，发现问题集中在首周首次产出和编辑体验。我主导补做了 12 场用户访谈，也分析了活跃用户和流失用户的行为差异，最后把问题收敛到“生成结果不稳定”和“编辑闭环太长”两个关键点。

基于这些判断，我推动团队优先做了提示词模板、结果二次编辑和团队协作入口三项优化，并和研发一起压缩了一个关键流程。项目上线后，7 日留存提升了 16%，团队周活提升了 22%，用户反馈里关于“难以上手”的抱怨明显下降。

这段经历里，我主要负责问题定义、方案拆解、优先级判断和跨团队推进。`;

const SAMPLE_JD = `高级产品经理（AI 应用方向）

岗位职责：
1. 负责 AI 应用类产品的需求洞察、方案设计和迭代优化
2. 能基于用户研究和数据分析识别问题，并推动跨团队落地
3. 与研发、设计、运营协同，持续提升产品体验和业务结果

任职要求：
1. 有较强的数据分析能力和用户洞察能力
2. 能独立完成复杂问题拆解，并做出业务判断
3. 有 AI 产品、效率工具、内容产品经验优先`;

const STYLE_OPTIONS: Array<{ value: CustomInterviewStyle; label: string }> = [
  { value: "standard", label: "标准面试官" },
  { value: "data", label: "强数据驱动" },
  { value: "user_insight", label: "强用户洞察" },
  { value: "structured", label: "结构推演型" },
  { value: "business", label: "业务判断型" },
  { value: "pressure", label: "压力追问型" }
];

const DIFFICULTY_OPTIONS: Array<{ value: CustomInterviewDifficulty; label: string }> = [
  { value: "basic", label: "基础" },
  { value: "normal", label: "正常" },
  { value: "advanced", label: "进阶" }
];

const ANSWER_METHOD_OPTIONS: Array<{ value: CustomInterviewAnswerMethod; label: string; disabled?: boolean }> = [
  { value: "text", label: "文字回答" },
  { value: "voice", label: "语音回答（即将支持）", disabled: true }
];

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createInputMeta(inputType: CustomInputMeta["input_type"] = "text"): CustomInputMeta {
  return {
    input_type: inputType,
    original_file_name: "",
    extracted_text: "",
    edited_text: "",
    parse_source: "manual_text",
    confirmed: false
  };
}

function briefTitle(jdText: string, matchSummary: MatchSummary | null) {
  const firstLine = jdText
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);

  if (firstLine) return firstLine.slice(0, 28);
  if (matchSummary?.job_focus.length) return `定制面试｜${matchSummary.job_focus.slice(0, 2).map((item) => item.point).join(" / ")}`;
  return "定制面试";
}

function statusLabel(state: CustomInterviewState) {
  if (state === "thinking") return "正在分析本题";
  if (state === "completed") return "本轮已完成";
  if (state === "interviewing") return "正在进行定制面试";
  if (state === "brief_ready") return "已完成岗位 briefing";
  return "等待你开始";
}

function buildHistorySummary(matchSummary: MatchSummary | null) {
  if (!matchSummary) return "尚未完成岗位匹配摘要";
  const focus = matchSummary.job_focus
    .slice(0, 2)
    .map((item) => item.point)
    .join(" · ");
  return focus || matchSummary.biggest_gap || "已生成定制面试摘要";
}

function compactCopy(text: string, limit = 72) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}...`;
}

async function postJson<T>(payload: unknown) {
  const response = await fetch("/api/custom-interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || "请求失败，请稍后再试。");
  }

  return data;
}

export default function CustomInterviewPage() {
  const [sessionId, setSessionId] = useState("");
  const [interviewState, setInterviewState] = useState<CustomInterviewState>("draft");
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [resumeInput, setResumeInput] = useState<CustomInputMeta>(createInputMeta("text"));
  const [jdInput, setJdInput] = useState<CustomInputMeta>(createInputMeta("text"));
  const [resumeParsed, setResumeParsed] = useState<ResumeParsed | null>(null);
  const [jdParsed, setJdParsed] = useState<JdParsed | null>(null);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<CustomInterviewStyle>("standard");
  const [selectedDifficulty, setSelectedDifficulty] = useState<CustomInterviewDifficulty>("normal");
  const [answerMethod, setAnswerMethod] = useState<CustomInterviewAnswerMethod>("text");
  const [questions, setQuestions] = useState<CustomInterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<CustomInterviewAnswer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<CustomInterviewQuestion | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [finalReview, setFinalReview] = useState<CustomInterviewReview | null>(null);
  const [debugTrace, setDebugTrace] = useState<CustomInterviewDebugTrace | null>(null);
  const [latestWeakPoint, setLatestWeakPoint] = useState("");
  const [totalQuestions, setTotalQuestions] = useState(4);
  const [statusMessage, setStatusMessage] = useState("先贴简历和岗位 JD，我会先帮你做一页面试前 briefing。");
  const [resumeInputMessage, setResumeInputMessage] = useState("上传简历文件后，我会先提取文字并回填到下面的文本框里。");
  const [jdInputMessage, setJdInputMessage] = useState("上传 JD 截图后，我会先提取图片文字并回填到下面的文本框里。");
  const [historyItems, setHistoryItems] = useState<CustomInterviewSession[]>([]);
  const [isExtractingResume, setIsExtractingResume] = useState(false);
  const [isExtractingJd, setIsExtractingJd] = useState(false);
  const [resumeInputError, setResumeInputError] = useState("");
  const [jdInputError, setJdInputError] = useState("");
  const [error, setError] = useState("");

  const hasStartedInterview = interviewState === "interviewing" || interviewState === "thinking" || interviewState === "completed";
  const isReadyToParse = !!resumeText.trim() && !!jdText.trim() && resumeInput.confirmed && jdInput.confirmed && !hasStartedInterview;

  function loadSessions() {
    setHistoryItems(readCustomSessions());
  }

  function persistSession(nextStatus?: CustomInterviewSession["status"]) {
    if (!sessionId) return;
    if (!resumeText.trim() && !jdText.trim() && !questions.length && !matchSummary) return;

    const existing = readCustomSessions().find((item) => item.session_id === sessionId);
    const session: CustomInterviewSession = {
      session_id: sessionId,
      mode: "custom_interview",
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: nextStatus || (interviewState === "completed" ? "completed" : "in_progress"),
      title: briefTitle(jdText, matchSummary),
      interview_state: interviewState,
      selected_style: selectedStyle,
      selected_difficulty: selectedDifficulty,
      answer_method: answerMethod,
      resume_input: resumeInput,
      jd_input: jdInput,
      resume_text: resumeText,
      jd_text: jdText,
      resume_parsed: resumeParsed,
      jd_parsed: jdParsed,
      match_summary: matchSummary,
      questions,
      answers,
      followups: questions.filter((question) => question.kind === "followup").map((question) => question.content),
      current_question: currentQuestion,
      final_review: finalReview,
      debug_trace: debugTrace
    };

    setHistoryItems(upsertCustomSession(session));
  }

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    persistSession(interviewState === "completed" ? "completed" : "in_progress");
  }, [
    sessionId,
    interviewState,
    resumeText,
    jdText,
    resumeParsed,
    jdParsed,
    matchSummary,
    selectedStyle,
    selectedDifficulty,
    answerMethod,
    resumeInput,
    jdInput,
    questions,
    answers,
    currentQuestion,
    finalReview
  ]);

  useEffect(() => {
    return () => {
      if (sessionId && interviewState !== "completed") {
        persistSession("interrupted");
      }
    };
  }, [
    sessionId,
    interviewState,
    resumeText,
    jdText,
    resumeParsed,
    jdParsed,
    matchSummary,
    selectedStyle,
    selectedDifficulty,
    answerMethod,
    resumeInput,
    jdInput,
    questions,
    answers,
    currentQuestion,
    finalReview
  ]);

  const briefingTags = useMemo(() => matchSummary?.job_focus.slice(0, 3).map((item) => item.point) ?? [], [matchSummary]);
  const recommendedExperience = matchSummary?.recommended_experiences[0]?.title || "尚未选定";
  const compactJobFocus = matchSummary?.job_focus.slice(0, 3) ?? [];
  const primaryExperience = matchSummary?.recommended_experiences[0] ?? null;
  const compactFollowups = matchSummary?.likely_followups.slice(0, 2) ?? [];

  function invalidateBriefing() {
    setResumeParsed(null);
    setJdParsed(null);
    setMatchSummary(null);
    setQuestions([]);
    setAnswers([]);
    setCurrentQuestion(null);
    setCurrentAnswer("");
    setFinalReview(null);
    setDebugTrace(null);
    setLatestWeakPoint("");
    if (!hasStartedInterview) {
      setInterviewState("draft");
    }
  }

  async function extractInput(kind: "resume" | "jd_image", file: File) {
    const formData = new FormData();
    formData.append("kind", kind);
    formData.append("file", file);

    const response = await fetch("/api/custom-interview/extract", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as ExtractInputResponse;
    if (!response.ok) {
      throw new Error(payload.error || "提取失败，请稍后再试。");
    }

    return payload;
  }

  async function handleResumeUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtractingResume(true);
    setResumeInputError("");
    setError("");

    try {
      const payload = await extractInput("resume", file);
      invalidateBriefing();
      setResumeText(payload.extracted_text);
      setResumeInput({
        input_type: "file",
        original_file_name: payload.original_file_name,
        extracted_text: payload.extracted_text,
        edited_text: payload.extracted_text,
        parse_source: payload.parse_source,
        confirmed: false
      });
      setResumeInputMessage("已从文件中提取出简历内容，建议先快速检查是否有遗漏或格式错误。");
      setStatusMessage("简历内容已经提取出来了。你可以先检查并确认，再继续处理岗位 JD。");
    } catch (uploadError) {
      setResumeInputError(uploadError instanceof Error ? uploadError.message : "这份简历文件暂时没能稳定解析，请尝试重新上传，或直接粘贴简历文本。");
    } finally {
      setIsExtractingResume(false);
      event.target.value = "";
    }
  }

  async function handleJdImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtractingJd(true);
    setJdInputError("");
    setError("");

    try {
      const payload = await extractInput("jd_image", file);
      invalidateBriefing();
      setJdText(payload.extracted_text);
      setJdInput({
        input_type: "image",
        original_file_name: payload.original_file_name,
        extracted_text: payload.extracted_text,
        edited_text: payload.extracted_text,
        parse_source: payload.parse_source,
        confirmed: false
      });
      setJdInputMessage("已从图片中提取出 JD 内容，建议先检查是否有遗漏或识别错误。");
      setStatusMessage("岗位内容已经从截图里提出来了。你可以先检查并确认，再开始解析。");
    } catch (uploadError) {
      setJdInputError(uploadError instanceof Error ? uploadError.message : "没能稳定识别这张截图里的岗位内容，请尝试上传更清晰的图片，或直接粘贴 JD 文本。");
    } finally {
      setIsExtractingJd(false);
      event.target.value = "";
    }
  }

  function handleResumeTextChange(value: string) {
    invalidateBriefing();
    setResumeText(value);
    setResumeInput((current) => ({
      ...current,
      input_type: current.input_type === "file" ? "file" : "text",
      edited_text: value,
      extracted_text: current.extracted_text || value,
      parse_source: current.parse_source || "manual_text",
      confirmed: false
    }));
    setResumeInputError("");
  }

  function handleJdTextChange(value: string) {
    invalidateBriefing();
    setJdText(value);
    setJdInput((current) => ({
      ...current,
      input_type: current.input_type === "image" ? "image" : "text",
      edited_text: value,
      extracted_text: current.extracted_text || value,
      parse_source: current.parse_source || "manual_text",
      confirmed: false
    }));
    setJdInputError("");
  }

  function confirmResumeText() {
    if (!resumeText.trim()) {
      setResumeInputError("请先补齐简历内容，再确认。");
      return;
    }

    setResumeInput((current) => ({
      ...current,
      edited_text: resumeText,
      extracted_text: current.extracted_text || resumeText,
      parse_source: current.parse_source || "manual_text",
      confirmed: true
    }));
    setResumeInputError("");
    setResumeInputMessage(
      resumeInput.input_type === "file"
        ? "简历文本已确认，后续会基于这版文本进入解析。"
        : "简历文本已确认，可以继续处理岗位 JD。"
    );
  }

  function confirmJdText() {
    if (!jdText.trim()) {
      setJdInputError("请先补齐岗位 JD 内容，再确认。");
      return;
    }

    setJdInput((current) => ({
      ...current,
      edited_text: jdText,
      extracted_text: current.extracted_text || jdText,
      parse_source: current.parse_source || "manual_text",
      confirmed: true
    }));
    setJdInputError("");
    setJdInputMessage(
      jdInput.input_type === "image"
        ? "JD 文本已确认，后续会基于这版内容进入解析。"
        : "JD 文本已确认，可以开始这一轮解析。"
    );
  }

  function handleTryExample() {
    setResumeText(SAMPLE_RESUME);
    setJdText(SAMPLE_JD);
    setResumeInput({
      input_type: "text",
      original_file_name: "",
      extracted_text: SAMPLE_RESUME,
      edited_text: SAMPLE_RESUME,
      parse_source: "manual_example",
      confirmed: true
    });
    setJdInput({
      input_type: "text",
      original_file_name: "",
      extracted_text: SAMPLE_JD,
      edited_text: SAMPLE_JD,
      parse_source: "manual_example",
      confirmed: true
    });
    setResumeInputMessage("示例简历内容已就绪。");
    setJdInputMessage("示例岗位 JD 已就绪。");
    setStatusMessage("示例内容已填好。你可以直接开始解析，看看这类岗位会怎么切你的经历。");
    setError("");
  }

  function handleNewRound() {
    if (sessionId && interviewState !== "completed") {
      persistSession("interrupted");
    }

    setSessionId("");
    setInterviewState("draft");
    setResumeText("");
    setJdText("");
    setResumeInput(createInputMeta("text"));
    setJdInput(createInputMeta("text"));
    setResumeParsed(null);
    setJdParsed(null);
    setMatchSummary(null);
    setQuestions([]);
    setAnswers([]);
    setCurrentQuestion(null);
    setCurrentAnswer("");
    setFinalReview(null);
    setDebugTrace(null);
    setLatestWeakPoint("");
    setTotalQuestions(4);
    setSelectedStyle("standard");
    setSelectedDifficulty("normal");
    setAnswerMethod("text");
    setResumeInputMessage("上传简历文件后，我会先提取文字并回填到下面的文本框里。");
    setJdInputMessage("上传 JD 截图后，我会先提取图片文字并回填到下面的文本框里。");
    setResumeInputError("");
    setJdInputError("");
    setStatusMessage("先贴简历和岗位 JD，我会先帮你做一页面试前 briefing。");
    setError("");
  }

  function restoreSession(session: CustomInterviewSession) {
    setSessionId(session.session_id);
    setInterviewState(session.interview_state === "thinking" ? "interviewing" : session.interview_state);
    setResumeText(session.resume_text);
    setJdText(session.jd_text);
    setResumeInput(session.resume_input || createInputMeta("text"));
    setJdInput(session.jd_input || createInputMeta("text"));
    setResumeParsed(session.resume_parsed);
    setJdParsed(session.jd_parsed);
    setMatchSummary(session.match_summary);
    setSelectedStyle(session.selected_style);
    setSelectedDifficulty(session.selected_difficulty);
    setAnswerMethod(session.answer_method);
    setQuestions(session.questions);
    setAnswers(session.answers);
    setCurrentQuestion(session.current_question);
    setCurrentAnswer("");
    setFinalReview(session.final_review);
    setDebugTrace(session.debug_trace);
    setLatestWeakPoint("");
    setResumeInputError("");
    setJdInputError("");
    setStatusMessage(session.final_review ? "已恢复到上一轮岗位导向复盘。" : "已恢复到上一轮定制面试。");
    setError("");
  }

  function handleContinueLatest() {
    const session = getLatestInProgressCustomSession();
    if (!session) {
      setError("当前没有可继续的定制面试。");
      return;
    }

    restoreSession(session);
  }

  function handleSelectHistory(id: string) {
    const session = getCustomSessionById(id);
    if (!session) {
      setError("这轮定制面试记录暂时找不到了。");
      return;
    }

    restoreSession(session);
  }

  async function handleParse() {
    if (!resumeText.trim() || !jdText.trim()) {
      setError("请先补齐简历和岗位 JD。");
      return;
    }

    if (!resumeInput.confirmed || !jdInput.confirmed) {
      setError("请先确认简历文本和岗位 JD 文本，再开始解析。");
      return;
    }

    const nextSessionId = sessionId || createId("custom-interview");
    setSessionId(nextSessionId);
    setInterviewState("thinking");
    setStatusMessage("我先对照简历和岗位，给你做一页轻量 briefing。");
    setError("");
    setFinalReview(null);
    setDebugTrace(null);
    setQuestions([]);
    setAnswers([]);
    setCurrentQuestion(null);
    setCurrentAnswer("");

    try {
      const resumeResult = await postJson<ParseResumeResponse>({
        action: "parse_resume",
        resume_text: resumeText
      });
      setStatusMessage("简历侧重点已经拆出来了，我继续看岗位 JD。");
      setResumeParsed(resumeResult.resume_parsed);

      const jdResult = await postJson<ParseJdResponse>({
        action: "parse_jd",
        jd_text: jdText
      });
      setJdParsed(jdResult.jd_parsed);
      setStatusMessage("岗位重点已经抓出来了，正在生成这轮定制面试摘要。");

      const summaryResult = await postJson<BuildMatchSummaryResponse>({
        action: "build_match_summary",
        resume_parsed: resumeResult.resume_parsed,
        jd_parsed: jdResult.jd_parsed
      });

      setMatchSummary(summaryResult.match_summary);
      setSelectedStyle((current) => (current === "standard" ? mapStyle(summaryResult.match_summary.suggested_style) : current));
      setInterviewState("brief_ready");
      setStatusMessage("briefing 已经准备好。你可以先扫一眼，再开始这一轮定制面试。");
    } catch (parseError) {
      setInterviewState("draft");
      setStatusMessage("这一轮 briefing 还没准备好。");
      setError(parseError instanceof Error ? parseError.message : "解析失败，请稍后再试。");
    }
  }

  function mapStyle(label: string): CustomInterviewStyle {
    if (label.includes("数据")) return "data";
    if (label.includes("用户")) return "user_insight";
    if (label.includes("结构")) return "structured";
    if (label.includes("业务")) return "business";
    if (label.includes("压力")) return "pressure";
    return "standard";
  }

  async function handleStartInterview() {
    if (!resumeParsed || !jdParsed || !matchSummary) {
      setError("请先完成简历和 JD 的解析。");
      return;
    }

    setInterviewState("thinking");
    setStatusMessage("我会先从最值得主讲的经历切进来。");
    setError("");

    try {
      const result = await postJson<RunCustomInterviewResponse>({
        action: "run_custom_interview",
        stage: "start",
        match_summary: matchSummary,
        resume_parsed: resumeParsed,
        jd_parsed: jdParsed,
        selected_style: selectedStyle,
        selected_difficulty: selectedDifficulty
      });

      const openingQuestion: CustomInterviewQuestion = {
        id: createId("custom-question"),
        index: result.question_index,
        kind: "opening",
        content: result.next_question_or_followup,
        weak_point: result.weak_point
      };

      setQuestions([openingQuestion]);
      setCurrentQuestion(openingQuestion);
      setAnswers([]);
      setCurrentAnswer("");
      setTotalQuestions(result.total_questions);
      setLatestWeakPoint(result.weak_point);
      setDebugTrace(result.debug_trace);
      setInterviewState("interviewing");
      setStatusMessage("现在已经切进正式问答。你先把这一题讲顺。");
    } catch (interviewError) {
      setInterviewState("brief_ready");
      setError(interviewError instanceof Error ? interviewError.message : "暂时没法开始这一轮定制面试。");
    }
  }

  async function handleSubmitAnswer() {
    if (!currentQuestion || !currentAnswer.trim() || !matchSummary || !resumeParsed || !jdParsed) {
      setError("请先写下这一题的回答。");
      return;
    }

    const nextAnswer: CustomInterviewAnswer = {
      id: createId("custom-answer"),
      question_id: currentQuestion.id,
      content: currentAnswer.trim(),
      created_at: new Date().toISOString()
    };
    const nextAnswers = [...answers, nextAnswer];

    setAnswers(nextAnswers);
    setInterviewState("thinking");
    setStatusMessage("我在看这题讲得够不够贴岗位，也在决定下一句该怎么追问。");
    setError("");

    try {
      const result = await postJson<RunCustomInterviewResponse>({
        action: "run_custom_interview",
        stage: "answer",
        match_summary: matchSummary,
        resume_parsed: resumeParsed,
        jd_parsed: jdParsed,
        selected_style: selectedStyle,
        selected_difficulty: selectedDifficulty,
        current_question: currentQuestion.content,
        current_question_index: currentQuestion.index,
        answers: nextAnswers.map((item) => item.content),
        latest_answer: nextAnswer.content
      });

      setLatestWeakPoint(result.weak_point);
      setDebugTrace(result.debug_trace);
      setCurrentAnswer("");
      setTotalQuestions(result.total_questions);

      if (result.should_finish && result.round_review) {
        setFinalReview(result.round_review);
        setCurrentQuestion(null);
        setInterviewState("completed");
        setStatusMessage("这轮定制面试已经结束，我先帮你收成一页岗位导向复盘。");
        return;
      }

      const followupQuestion: CustomInterviewQuestion = {
        id: createId("custom-question"),
        index: result.question_index,
        kind: "followup",
        content: result.next_question_or_followup,
        weak_point: result.weak_point
      };

      setQuestions((current) => [...current, followupQuestion]);
      setCurrentQuestion(followupQuestion);
      setInterviewState("interviewing");
      setStatusMessage("下一问已经准备好了。我会优先压这个岗位最看重、也是你刚才最薄弱的点。");
    } catch (answerError) {
      setInterviewState("interviewing");
      setError(answerError instanceof Error ? answerError.message : "这一题暂时没处理成功，请稍后再试。");
    }
  }

  async function handleFinishInterview() {
    if (!matchSummary || !resumeParsed || !jdParsed || !answers.length) return;

    setInterviewState("thinking");
    setStatusMessage("我先把这轮回答收住，整理成岗位导向复盘。");
    setError("");

    try {
      const result = await postJson<RunCustomInterviewResponse>({
        action: "run_custom_interview",
        stage: "finish",
        match_summary: matchSummary,
        resume_parsed: resumeParsed,
        jd_parsed: jdParsed,
        selected_style: selectedStyle,
        selected_difficulty: selectedDifficulty,
        current_question: currentQuestion?.content,
        current_question_index: currentQuestion?.index || questions.length,
        answers: answers.map((item) => item.content),
        latest_answer: answers[answers.length - 1]?.content || ""
      });

      if (result.round_review) {
        setFinalReview(result.round_review);
      }

      setCurrentQuestion(null);
      setDebugTrace(result.debug_trace);
      setInterviewState("completed");
      setStatusMessage("这轮定制面试已经结束，我先帮你收成一页岗位导向复盘。");
    } catch (finishError) {
      setInterviewState("interviewing");
      setError(finishError instanceof Error ? finishError.message : "暂时没法完成这一轮复盘。");
    }
  }

  return (
    <PracticeLayout
      mode="custom"
      onTryExample={handleTryExample}
      onNewRound={handleNewRound}
      onContinueLatest={handleContinueLatest}
      historyItems={historyItems.map((item) => ({
        id: item.session_id,
        title: item.title,
        updatedAt: item.updated_at,
        status: item.status,
        modeLabel: "定制面试",
        summary: buildHistorySummary(item.match_summary)
      }))}
      onSelectHistory={handleSelectHistory}
    >
      <div className="custom-shell">
        <section className="custom-header">
          <div>
            <h1 className="mock-title">定制面试</h1>
            <p className="mock-subtitle">基于你的简历和岗位 JD，先识别最值得主讲的经历，再开始这一轮更贴岗位的面试。</p>
          </div>
        </section>

        <section className="custom-input-grid">
          <div className="custom-card">
            <div className="custom-card-head">
              <div>
                <p className="section-tag">简历输入</p>
                <h2>上传简历</h2>
              </div>
              <label className="custom-upload-button">
                {isExtractingResume ? "正在提取…" : "选择文件"}
                <input type="file" accept=".txt,.pdf,.docx" onChange={handleResumeUpload} hidden disabled={hasStartedInterview || isExtractingResume} />
              </label>
            </div>
            <p className="custom-helper">上传简历文件，或直接粘贴简历内容。支持 pdf / docx / txt。</p>
            <p className="custom-helper">{resumeInputMessage}</p>
            {resumeInput.original_file_name ? <p className="custom-helper">当前文件：{resumeInput.original_file_name}</p> : null}
            <label className="custom-field-label" htmlFor="resume-text">
              或直接粘贴简历内容
            </label>
            <textarea
              id="resume-text"
              className="custom-textarea"
              value={resumeText}
              onChange={(event) => handleResumeTextChange(event.target.value)}
              placeholder="把与你目标岗位最相关的经历、项目、结果、职责边界贴进来。"
              rows={12}
              disabled={hasStartedInterview}
            />
            <div className="custom-answer-actions">
              <button className="secondary-button" onClick={() => confirmResumeText()} disabled={hasStartedInterview || !resumeText.trim()}>
                {resumeInput.confirmed ? "已确认简历文本" : "确认简历文本"}
              </button>
            </div>
            {resumeInputError ? <p className="error-banner">{resumeInputError}</p> : null}
          </div>

          <div className="custom-card">
            <div className="custom-card-head">
              <div>
                <p className="section-tag">岗位 JD</p>
                <h2>粘贴岗位 JD</h2>
              </div>
              <label className="custom-upload-button">
                {isExtractingJd ? "正在识别…" : "上传截图"}
                <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={handleJdImageUpload} hidden disabled={hasStartedInterview || isExtractingJd} />
              </label>
            </div>
            <p className="custom-helper">粘贴岗位 JD，或上传招聘平台截图 / 长图。支持 png / jpg / jpeg / webp。</p>
            <p className="custom-helper">{jdInputMessage}</p>
            {jdInput.original_file_name ? <p className="custom-helper">当前图片：{jdInput.original_file_name}</p> : null}
            <textarea
              className="custom-textarea"
              value={jdText}
              onChange={(event) => handleJdTextChange(event.target.value)}
              placeholder="把目标岗位的职责、要求、加分项直接贴进来。"
              rows={12}
              disabled={hasStartedInterview}
            />
            <div className="custom-answer-actions">
              <button className="secondary-button" onClick={() => confirmJdText()} disabled={hasStartedInterview || !jdText.trim()}>
                {jdInput.confirmed ? "已确认 JD 文本" : "确认 JD 文本"}
              </button>
            </div>
            {jdInputError ? <p className="error-banner">{jdInputError}</p> : null}
          </div>
        </section>

        <section className="custom-card">
          <div className="custom-card-head">
            <div>
              <p className="section-tag">岗位摘要</p>
              <h2>先做一页轻量 briefing</h2>
            </div>
            <button className="primary-button" onClick={() => void handleParse()} disabled={interviewState === "thinking" || !isReadyToParse}>
              开始解析
            </button>
          </div>
          <p className="custom-brief-copy">{statusMessage}</p>

          {matchSummary ? (
            <div className="custom-summary-grid">
              <div className="custom-summary-block">
                <p className="custom-summary-label">这个岗位最看重什么</p>
                <div className="custom-tag-row">
                  {compactJobFocus.map((item) => (
                    <span key={item.point} className="custom-tag">
                      {item.point}
                    </span>
                  ))}
                </div>
                {compactJobFocus[0] ? <p className="custom-summary-reason is-compact">{compactCopy(compactJobFocus[0].reason, 78)}</p> : null}
              </div>
              <div className="custom-summary-block">
                <p className="custom-summary-label">你最适合拿出来讲的经历</p>
                {primaryExperience ? (
                  <div className="custom-summary-detail">
                    <p className="custom-summary-item-title is-compact">{primaryExperience.title}</p>
                    <p className="custom-summary-reason is-compact">{compactCopy(primaryExperience.why_match, 110)}</p>
                  </div>
                ) : (
                  <p className="custom-summary-reason is-compact">还没有选出主讲经历。</p>
                )}
              </div>
              <div className="custom-summary-block">
                <p className="custom-summary-label">你最可能被追问的地方</p>
                <ul className="custom-summary-list">
                  {compactFollowups.map((item) => (
                    <li key={item.point}>
                      <span className="custom-summary-item-title">{item.point}</span>
                      <p className="custom-summary-reason is-compact">{compactCopy(item.reason, 86)}</p>
                    </li>
                  ))}
                </ul>
                <p className="custom-summary-reason is-compact">最大风险：{compactCopy(matchSummary.biggest_gap, 78)}</p>
              </div>
            </div>
          ) : (
            <p className="sidebar-note">摘要会控制在面试前 briefing 的颗粒度，不会展开成长篇分析报告。</p>
          )}
        </section>

        {matchSummary ? (
          <details className="custom-card custom-debug-card">
            <summary className="custom-debug-summary">开发调试：查看定制信息是否真正进入出题链路</summary>
            <div className="custom-debug-grid">
              <div className="custom-summary-block">
                <p className="custom-summary-label">当前 job_focus</p>
                <div className="custom-tag-row">
                  {matchSummary.job_focus.map((item) => (
                    <span key={item.point} className="custom-tag">
                      {item.point}
                    </span>
                  ))}
                </div>
              </div>
              <div className="custom-summary-block">
                <p className="custom-summary-label">当前 recommended_experience</p>
                <p className="custom-debug-value">{matchSummary.recommended_experiences[0]?.title || "尚未选定"}</p>
              </div>
              <div className="custom-summary-block">
                <p className="custom-summary-label">当前 selected_style</p>
                <p className="custom-debug-value">{STYLE_OPTIONS.find((item) => item.value === selectedStyle)?.label || "标准面试官"}</p>
              </div>
            </div>
            <div className="custom-summary-block">
              <p className="custom-summary-label">当前首题 / 追问生成输入摘要</p>
              <p className="custom-debug-value">
                {debugTrace?.generation_input_summary || "开始面试后，这里会显示当前首题或追问实际使用的输入摘要。"}
              </p>
            </div>
          </details>
        ) : null}

        <section className="custom-card">
          <div className="custom-card-head">
            <div>
              <p className="section-tag">面试配置</p>
              <h2>决定这一轮怎么问</h2>
            </div>
            <button className="primary-button" onClick={() => void handleStartInterview()} disabled={!matchSummary || hasStartedInterview}>
              开始这轮定制面试
            </button>
          </div>

          <div className="custom-config-grid">
            <div className="custom-config-group">
              <p className="custom-field-label">面试风格</p>
              <div className="custom-answer-methods" role="radiogroup" aria-label="面试风格">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`custom-answer-method ${selectedStyle === option.value ? "is-active" : ""}`}
                    aria-pressed={selectedStyle === option.value}
                    onClick={() => setSelectedStyle(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="custom-config-group">
              <p className="custom-field-label">难度</p>
              <div className="custom-answer-methods" role="radiogroup" aria-label="难度">
                {DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`custom-answer-method ${selectedDifficulty === option.value ? "is-active" : ""}`}
                    aria-pressed={selectedDifficulty === option.value}
                    onClick={() => setSelectedDifficulty(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="custom-config-group">
              <p className="custom-field-label">回答方式</p>
              <div className="custom-answer-methods">
                {ANSWER_METHOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`custom-answer-method ${answerMethod === option.value ? "is-active" : ""}`}
                    onClick={() => !option.disabled && setAnswerMethod(option.value)}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {hasStartedInterview ? (
          <section className="custom-interview-panel">
            <div className="custom-topbar">
              <div>
                <p className="section-tag">当前模式</p>
                <h2>定制面试</h2>
              </div>
              <div className="custom-topbar-meta">
                <div className="custom-tag-row">
                  {briefingTags.map((tag) => (
                    <span key={tag} className="custom-tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="custom-topbar-copy">当前主讲经历：{recommendedExperience}</p>
              </div>
            </div>

            <div className="custom-question-card">
              <div className="custom-question-meta">
                <span className="custom-question-index">
                  第 {currentQuestion?.index || Math.min(questions.length, totalQuestions)} / {totalQuestions} 题
                </span>
                <span className="custom-light-status">{statusLabel(interviewState)}</span>
              </div>
              <h3>{currentQuestion?.content || "这一轮已经结束，下面是岗位导向复盘。"}</h3>
              {latestWeakPoint ? <p className="custom-helper">这一轮我优先压实的点：{latestWeakPoint}</p> : null}
              {debugTrace ? <p className="custom-helper">调试：{debugTrace.generation_input_summary}</p> : null}
            </div>

            {currentQuestion ? (
              <div className="custom-answer-panel">
                <label className="custom-field-label" htmlFor="custom-answer">
                  你的回答
                </label>
                <textarea
                  id="custom-answer"
                  className="custom-textarea is-answer"
                  value={currentAnswer}
                  onChange={(event) => setCurrentAnswer(event.target.value)}
                  placeholder="先像真实面试一样讲，不用追求完美。把这题最关键的背景、动作、判断和结果写出来。"
                  rows={8}
                  disabled={interviewState === "thinking"}
                />
                <div className="custom-answer-actions">
                  <button className="primary-button" onClick={() => void handleSubmitAnswer()} disabled={interviewState === "thinking" || !currentAnswer.trim()}>
                    提交这一题
                  </button>
                  <button className="secondary-button" onClick={() => void handleFinishInterview()} disabled={interviewState === "thinking" || !answers.length}>
                    提前结束并复盘
                  </button>
                </div>
              </div>
            ) : null}

            {questions.length ? (
              <div className="custom-log">
                {questions.map((question) => {
                  const answer = answers.find((item) => item.question_id === question.id);
                  return (
                    <div key={question.id} className="custom-log-item">
                      <p className="custom-log-label">面试官</p>
                      <p className="custom-log-content">{question.content}</p>
                      {answer ? (
                        <>
                          <p className="custom-log-label is-answer">你的回答</p>
                          <p className="custom-log-content">{answer.content}</p>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {finalReview ? (
          <section className="custom-card">
            <div className="custom-card-head">
              <div>
                <p className="section-tag">岗位导向复盘</p>
                <h2>这一轮先这样收</h2>
              </div>
            </div>
            <div className="custom-review-grid">
              <div className="custom-summary-block">
                <p className="custom-summary-label">总体岗位匹配表现</p>
                <p>{finalReview.overall_match}</p>
              </div>
              <div className="custom-summary-block">
                <p className="custom-summary-label">最容易失分的地方</p>
                <p>{finalReview.biggest_loss_risk}</p>
              </div>
              <div className="custom-summary-block">
                <p className="custom-summary-label">与岗位最不匹配的短板</p>
                <p>{finalReview.mismatch_gap}</p>
              </div>
              <div className="custom-summary-block">
                <p className="custom-summary-label">最值得继续补练的一段经历</p>
                <p>{finalReview.best_experience_to_retrain}</p>
              </div>
              <div className="custom-summary-block">
                <p className="custom-summary-label">下一步建议</p>
                <p>{finalReview.next_step}</p>
              </div>
            </div>
          </section>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </PracticeLayout>
  );
}
