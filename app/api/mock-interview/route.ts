import { NextResponse } from "next/server";
import { getChatProviderConfig, requestChatCompletion } from "../../lib/server/ai-provider";
import { parseJsonObject, readAssistantTextContent } from "../../lib/server/json-output";

const FIRST_QUESTION =
  "请介绍一个你做过、最能体现你产品能力的项目。你可以重点讲：为什么要做、你自己做了什么、最后带来了什么结果。";

const INTERVIEW_PROMPT_TEMPLATE = `你现在是一位真实、克制、专业的产品经理面试官，同时也具备面试教练能力。

你的任务不是写长篇分析报告，而是推进一轮“真实面试式”的对话。

【核心原则】
1. 不要替候选人编造经历、背景、数据、职责、结果
2. 如果候选人信息不够，不要硬总结，先顺着上一轮继续追问
3. 追问必须自然、具体，像真实面试官会接着问的一句
4. 如果信息已经足够，给出简短阶段反馈和本轮小结
5. 整体语气要像真实面试官，不要像考试批改器

【你的目标】
你要判断：候选人这一轮回答之后，是应该继续追问，还是可以先做本轮小结。

【判定规则】
优先判断这些信息是否已经足够：
- 有没有基本背景和任务目标
- 有没有候选人自己的动作和判断
- 有没有结果、结论或业务价值
- 表达是否具体到足够支撑继续判断

【输出规则】
你只能输出两种模式之一：

1. ask_followup
适用场景：
- 当前回答还有关键缺口
- 继续问 1 个问题，就能更接近真实面试判断

要求：
- interviewer_message 必须是一句自然的追问
- short_feedback 可以为空，或用一句很短的话指出为什么继续追问
- summary 里的所有字段都必须为空字符串

2. round_summary
适用场景：
- 信息已经足够做一轮阶段性判断
- 或者已经追问过一次，不要无限追问

要求：
- interviewer_message 用一句自然的话收住这一轮，例如“好，这一轮我先帮你收一下。”
- short_feedback 用 1-2 句话给阶段反馈
- summary 必须完整输出：
  - overview：本轮表现概览，简短
  - biggest_issue：最大问题，简短直接
  - next_suggestion：下一轮建议，一句话
  - practice_version：基于候选人真实信息整理出一版更适合开口练的回答，控制在 120-220 字，不补编事实

【强限制】
- 如果 followup_count 已经 >= 1，默认不要继续追问，直接输出 round_summary
- 如果 force_summary = true，也必须输出 round_summary
- practice_version 只能基于候选人已经说过的内容整理，不允许新增事实

【输出格式】
请严格输出以下 JSON，不要输出 markdown，不要输出额外解释：
{
  "mode": "ask_followup" or "round_summary",
  "interviewer_message": "",
  "short_feedback": "",
  "summary": {
    "overview": "",
    "biggest_issue": "",
    "next_suggestion": "",
    "practice_version": ""
  }
}

【上下文】
force_summary: {{force_summary}}
followup_count: {{followup_count}}

【本轮对话记录】
{{conversation}}`;

const INTERVIEW_SCHEMA = {
  name: "mock_interview_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: {
        type: "string",
        enum: ["ask_followup", "round_summary"]
      },
      interviewer_message: { type: "string" },
      short_feedback: { type: "string" },
      summary: {
        type: "object",
        additionalProperties: false,
        properties: {
          overview: { type: "string" },
          biggest_issue: { type: "string" },
          next_suggestion: { type: "string" },
          practice_version: { type: "string" }
        },
        required: ["overview", "biggest_issue", "next_suggestion", "practice_version"]
      }
    },
    required: ["mode", "interviewer_message", "short_feedback", "summary"]
  }
} as const;

type MockTurn = {
  role: "assistant" | "user";
  kind: "question" | "answer" | "feedback" | "summary";
  content: string;
};

type MockInterviewResponse = {
  mode: "ask_followup" | "round_summary";
  interviewer_message: string;
  short_feedback: string;
  summary: {
    overview: string;
    biggest_issue: string;
    next_suggestion: string;
    practice_version: string;
  };
};

type ProviderResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

function stringifyConversation(history: MockTurn[]) {
  return history
    .map((turn, index) => `${index + 1}. ${turn.role === "assistant" ? "面试官" : "候选人"}（${turn.kind}）：${turn.content}`)
    .join("\n");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeProviderError(payload: ProviderResponse | null, fallbackText = "") {
  const message = payload?.error?.message?.trim() || fallbackText.trim();
  const type = payload?.error?.type?.trim() || "";
  const normalized = `${type} ${message}`.toLowerCase();

  if (normalized.includes("engine_overloaded") || normalized.includes("overloaded") || normalized.includes("rate limit")) {
    return "当前面试官服务有点忙，我已经收到你的回答。请直接再点一次提交，我会继续这一轮。";
  }

  return message || "模拟面试服务暂时不可用，请稍后再试。";
}

async function requestInterviewTurn(prompt: string) {
  const providerConfig = getChatProviderConfig();
  let lastStatus = 500;
  let lastPayload: ProviderResponse | null = null;
  let lastErrorText = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const providerResponse = await requestChatCompletion({
      config: providerConfig,
      messages: [
        {
          role: "system",
          content: "你是一位真实、克制、专业的产品经理面试官。你不能补编候选人没有提供的事实。你必须只输出合法 JSON。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: INTERVIEW_SCHEMA
      }
    });

    lastStatus = providerResponse.status || 500;
    const responseText = await providerResponse.text();
    lastErrorText = responseText;

    let payload: ProviderResponse | null = null;
    try {
      payload = JSON.parse(responseText) as ProviderResponse;
    } catch {
      payload = null;
    }

    lastPayload = payload;

    if (providerResponse.ok) {
      return {
        ok: true as const,
        payload
      };
    }

    const normalizedError = normalizeProviderError(payload, responseText);
    const isRetryable = normalizedError.includes("当前面试官服务有点忙");

    if (isRetryable && attempt === 0) {
      await wait(800);
      continue;
    }

    return {
      ok: false as const,
      status: lastStatus,
      error: normalizedError
    };
  }

  return {
    ok: false as const,
    status: lastStatus,
    error: normalizeProviderError(lastPayload, lastErrorText)
  };
}

export async function POST(request: Request) {
  try {
    const providerConfig = getChatProviderConfig();

    if (!providerConfig.apiKey) {
      return NextResponse.json({ error: "缺少 OPENAI_API_KEY。请先在 .env.local 中配置后再开始模拟面试。" }, { status: 500 });
    }

    const body = (await request.json()) as {
      action?: "start" | "answer" | "finish";
      history?: MockTurn[];
      followupCount?: number;
    };

    if (body.action === "start") {
      return NextResponse.json({
        mode: "ask_question",
        interviewer_message: FIRST_QUESTION,
        short_feedback: "",
        summary: null
      });
    }

    const history = body.history ?? [];
    const followupCount = body.followupCount ?? 0;
    const forceSummary = body.action === "finish";

    if (!history.length) {
      return NextResponse.json({ error: "缺少对话上下文，暂时无法继续这轮模拟面试。" }, { status: 400 });
    }

    const prompt = INTERVIEW_PROMPT_TEMPLATE
      .replace("{{force_summary}}", String(forceSummary))
      .replace("{{followup_count}}", String(followupCount))
      .replace("{{conversation}}", stringifyConversation(history));

    const providerResult = await requestInterviewTurn(prompt);

    if (!providerResult.ok) {
      return NextResponse.json({ error: providerResult.error }, { status: providerResult.status || 500 });
    }

    const payload = providerResult.payload;

    if (!payload) {
      return NextResponse.json({ error: "模型没有返回可用内容，请稍后再试。" }, { status: 500 });
    }

    const content = readAssistantTextContent(payload.choices?.[0]?.message?.content);

    if (!content) {
      return NextResponse.json({ error: "模型没有返回可用内容，请稍后再试。" }, { status: 500 });
    }

    const parsed = parseJsonObject<MockInterviewResponse>(content);

    if (!parsed) {
      return NextResponse.json({ error: "模型返回的结构化内容不可解析，请稍后再试。" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模拟面试服务暂时不可用，请稍后再试。" }, { status: 500 });
  }
}
