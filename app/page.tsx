"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const practiceVersion = useMemo(() => buildPracticeVersion(turn.result, "default"), [turn.result]);
  const localSupplementRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (turn.result.mode === "ask_followup" && !turn.isStreaming && localSupplementRef.current) {
      localSupplementRef.current.focus();
    }
  }, [turn.result.mode, turn.isStreaming]);

  return (
    <div className="chat-row assistant-row">
      <div className="assistant-avatar">AI</div>
      <div className="assistant-bubble">
        <div className="reply-block score-block">
          <div className="reply-block-header">
            <p className="section-tag">评分</p>
            <span className="score-badge">{turn.result.score.tier || "正在看"}</span>
          </div>
          {turn.isStreaming ? <ThinkingIndicator /> : null}
          <div className="score-row">
            <strong>{turn.result.score.value || "--"}</strong>
            <span>/ 100</span>
          </div>
          <p className="reply-text">
            {turn.result.score.summary || (turn.isStreaming ? "正在帮你整理这段回答…" : "这里会先告诉你，这一版回答大概处在什么水平。")}
          </p>
          {turn.result.reason ? <p className="module-caption">{turn.result.reason}</p> : null}
        </div>

        <div className="reply-block">
          <div className="reply-block-header">
            <p className="section-tag">这版回答最大的问题</p>
          </div>
          <p className="reply-text">
            {turn.result.main_issue || (turn.isStreaming ? "正在提炼这段回答里最容易卡住面试官的点..." : "这里会直接点出这段回答现在最影响效果的问题。")}
          </p>
        </div>

        <div className="reply-block followup-block">
          <div className="reply-block-header">
            <div>
              <p className="section-tag">面试官下一句大概率会追问什么</p>
              <p className="module-caption">把这些信息补充给我，我再帮你整理成更适合真实面试开口练的版本。</p>
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
                <p className="followup-side-title">在这里补充</p>
                <p className="followup-side-copy">把这些真实信息补充给我后，我会基于原回答加这一轮补充，生成一轮新的问答，不会覆盖前面的内容。</p>
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
  const [draft, setDraft] = useState(starterAnswer);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [baseAnswer, setBaseAnswer] = useState("");
  const [supplements, setSupplements] = useState<string[]>([]);
  const [pendingSupplementFor, setPendingSupplementFor] = useState<string | null>(null);
  const [supplementDraft, setSupplementDraft] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const supplementRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = draftRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    const textarea = supplementRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [supplementDraft, pendingSupplementFor]);

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
    if (!content || isAnalyzing) {
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
    setConversation([]);

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

  return (
    <main className="chat-shell">
      <section className="chat-header">
        <div>
          <p className="brand-name">AI INTERVIEW ASSISTANT</p>
          <h1 className="page-title">你不是没内容，只是还没把重点讲出来。</h1>
          <p className="header-subtitle">
            用对话的方式练面试会更接近真实场景。你先说一版，我来指出卡点；如果信息不够，我就继续追问，你补上后我们再往下练。
          </p>
        </div>
      </section>

      <section className="chat-thread">
        {conversation.length === 0 ? (
          <div className="empty-thread">
            <div className="assistant-avatar">AI</div>
            <div className="assistant-bubble empty-bubble">
              <p className="section-tag">开始练习</p>
              <h3 className="empty-state-title">先把你现在会说的那版发出来，我们一轮一轮往下练。</h3>
              <p className="empty-state-copy">
                这里不会只给你一次性的结果。更像真实面试场景：你先回答，我来给反馈；如果信息不够，我会继续追问；你补充后，我们再生成新的评分和下一版答案。
              </p>
            </div>
          </div>
        ) : (
          conversation.map((turn) =>
            turn.role === "user" ? (
              <div className="chat-row user-row" key={turn.id}>
                <div className="user-bubble">
                  <p className="user-label">{turn.kind === "initial" ? "我的原回答" : "我补充的信息"}</p>
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
                disabled={isAnalyzing}
              />
            )
          )
        )}
      </section>

      <section className="composer-dock">
        <div className="composer-card">
          <div className="composer-heading">
            <div>
              <p className="section-tag">你的回答</p>
              <h2>先别想标准答案，把你现在会说的那版写下来</h2>
              <p className="composer-description">不用写得很完美。越接近你真实开口时的状态，后面的追问和练习越有价值。</p>
            </div>
          </div>

          <textarea
            ref={draftRef}
            className="composer-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="不用写得很完美，就写你现在会怎么说。比如：我最近做过一次首页改版，当时转化率一直在掉……"
          />

          <div className="composer-footer">
            <span>已输入 {draft.trim().length} 字</span>
            <span>每次补充后，都会生成新的一轮评分，不会覆盖前一轮</span>
          </div>

          <div className="composer-actions">
            <button className="primary-button" onClick={() => void handleInitialSubmit()} disabled={isAnalyzing}>
              {isAnalyzing ? "正在帮你整理这段回答…" : conversation.length ? "重新开始这一题" : "帮我顺一顺这段回答"}
            </button>
            <button className="secondary-button" onClick={handleTryExample} disabled={isAnalyzing}>
              不知道怎么写？先试试这个
            </button>
          </div>

          {isAnalyzing ? <ThinkingIndicator label="正在整理你的回答" /> : null}

          {error ? <p className="error-banner">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
