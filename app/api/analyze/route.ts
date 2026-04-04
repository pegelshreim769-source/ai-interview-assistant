import { NextResponse } from "next/server";

const DECISION_PROMPT_TEMPLATE = `你现在是一位经验丰富、真实、克制的产品经理面试教练。

你的任务不是替用户编造经历，而是帮助用户把“真实做过的事情”讲清楚。

【核心原则】
1. 不要补编用户没有提供的项目背景、业务数据、结果、动作、角色边界
2. 如果用户输入信息不足，请优先指出缺口，并生成“真实面试中会被追问的问题”
3. 只有在用户提供的信息足够支撑一个真实、完整、可信的面试回答时，才生成“可直接开口练的版本”
4. 所有输出都必须贴近真实面试场景，避免官话、空话、模板腔

【五维判定框架】
请从以下 5 个维度判断用户回答是否足够完整：
1. 背景/任务（background）
2. 个人动作（ownership）
3. 方法/过程（method）
4. 结果/价值（result）
5. 清晰度/具体度（clarity）

【硬性规则】
请按以下规则做最终判定：

【必须追问 ask_followup】只要满足以下任一条件：
1. 背景/任务 缺失
2. 个人动作 缺失
3. 结果/价值 缺失
4. 清晰度/具体度 很差（模糊表达过多，无法支撑真实理解）

【可以生成练习版本 generate_practice】需要同时满足：
1. 背景/任务 存在
2. 个人动作 存在
3. 结果/价值 存在
4. 五个维度中至少满足 4 个
5. 模糊表达不能严重到影响理解

换句话说：
- 背景、个人动作、结果，这三项是硬门槛
- 方法/过程 和 清晰度 是辅助项
- 只要三项硬门槛里缺一项，就必须先追问

【维度判定标准】
1. has_background = true
当回答中能看出项目背景、业务目标、改版原因、要解决的问题

2. has_ownership = true
当回答中能明确看出用户本人做了什么，例如：
- 我主导了……
- 我分析了……
- 我提出了……
- 我推动了……
如果主要是“我们做了”“参与了”“一起做”，默认 false 或偏低

3. has_method = true
当回答中至少有一个可感知的方法或动作，例如：
- 漏斗分析
- 用户访谈
- 方案设计
- A/B测试
- SQL提数
- 推动跨部门协作

4. has_result = true
当回答中至少有一个可验证结果，例如：
- 指标变化
- 关键发现
- 上线结果
- 业务价值
- 用户反馈变化

5. clarity_level
- high：表达具体，信息密度高，基本没有大面积模糊表述
- medium：有少量模糊表达，但还能理解
- low：大量模糊词，导致背景、动作或结果都不够清晰

【追问逻辑】
当 mode = ask_followup 时，不要生成练习版本。
而是根据缺失项，生成 2-3 个最关键的追问：
- 缺背景/任务：问项目是什么场景、为什么做、解决什么问题
- 缺个人动作：问你自己具体负责什么、哪一步是你主导的
- 缺方法/过程：问你怎么判断问题、用了什么分析或验证方法
- 缺结果/价值：问最终带来了什么结果、如何验证有效

追问要求：
1. 只问最关键的 2-3 个问题
2. 问题必须具体、自然，像真实面试官会问的
3. 不要泛泛而谈
4. 不要让模型脑补

【练习版本限制】
当 mode = generate_practice 时，才允许生成练习版本。
生成要求：
1. 只能基于用户已提供的信息整理
2. 不允许补编新的项目背景、数据、结果、角色、方法
3. 可以优化表达和结构，但不能新增事实
4. 如果信息虽然勉强够用，但仍有明显缺口，也可以选择 ask_followup，而不是硬生成

【评分规则】
请给出一个 0-100 的分数，并标注档位：
- 0-39：无效回答
- 40-59：可用但普通
- 60-79：中上水平
- 80-100：强竞争力回答

评分说明要简洁，控制在一句话内。

【各模块输出要求】
1. main_issue：
- 80-120字以内
- 只指出最核心的一个问题
- 语气直接、专业，不要长篇分析

2. follow_up_questions：
- 输出 2-3 个问题
- 必须基于缺失项生成

3. actionable_suggestions：
- 输出 2-3 条建议
- 每条一句话
- 必须可执行

4. practice_version：
- 仅在 mode = generate_practice 时输出
- 只基于用户已经提供的信息整理
- 不允许新增未给出的事实
- 风格自然、口语化、适合真实面试
- 控制在 200-350 字

【输出格式要求】
请严格按以下 JSON 结构输出，不要输出额外解释，不要加 markdown：

{
  "mode": "ask_followup" or "generate_practice",
  "judgement": {
    "has_background": true,
    "has_ownership": true,
    "has_method": true,
    "has_result": true,
    "clarity_level": "high"
  },
  "reason": "简短说明为什么是这个模式",
  "score": {
    "value": 0,
    "tier": "",
    "summary": ""
  },
  "main_issue": "",
  "follow_up_questions": ["", "", ""],
  "actionable_suggestions": ["", "", ""],
  "practice_version": ""
}

规则：
- 如果 mode = "ask_followup"，practice_version 必须为空字符串
- 如果 mode = "generate_practice"，practice_version 才能有内容
- follow_up_questions 最少2个，最多3个
- actionable_suggestions 最少2个，最多3个
- judgement 和 reason 必须始终输出

现在请分析以下用户回答：

{{user_answer}}`;

const JSON_SCHEMA = {
  name: "interview_practice_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: {
        type: "string",
        enum: ["ask_followup", "generate_practice"]
      },
      judgement: {
        type: "object",
        additionalProperties: false,
        properties: {
          has_background: { type: "boolean" },
          has_ownership: { type: "boolean" },
          has_method: { type: "boolean" },
          has_result: { type: "boolean" },
          clarity_level: {
            type: "string",
            enum: ["high", "medium", "low"]
          }
        },
        required: ["has_background", "has_ownership", "has_method", "has_result", "clarity_level"]
      },
      reason: {
        type: "string"
      },
      score: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "number" },
          tier: { type: "string" },
          summary: { type: "string" }
        },
        required: ["value", "tier", "summary"]
      },
      main_issue: {
        type: "string"
      },
      follow_up_questions: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: { type: "string" }
      },
      actionable_suggestions: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: { type: "string" }
      },
      practice_version: {
        type: "string"
      }
    },
    required: ["mode", "judgement", "reason", "score", "main_issue", "follow_up_questions", "actionable_suggestions", "practice_version"]
  }
} as const;

type ProviderChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function encoderChunk(input: string) {
  return new TextEncoder().encode(input);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    if (!apiKey) {
      return NextResponse.json({ error: "缺少 OPENAI_API_KEY。请先在 .env.local 中配置后再生成分析。" }, { status: 500 });
    }

    const body = (await request.json()) as { answer?: string; supplement?: string };
    const answer = body.answer?.trim();
    const supplement = body.supplement?.trim();

    if (!answer) {
      return NextResponse.json({ error: "请输入候选人回答内容。" }, { status: 400 });
    }

    const mergedAnswer = supplement ? `${answer}\n\n【用户后续补充】\n${supplement}` : answer;
    const prompt = DECISION_PROMPT_TEMPLATE.replace("{{user_answer}}", mergedAnswer);

    const providerResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          {
            role: "system",
            content: "你是一位经验丰富、真实、克制的产品经理面试教练。你不能替用户补编事实，只能基于用户真实提供的信息做判断与整理。你必须只输出合法 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: JSON_SCHEMA
        }
      })
    });

    if (!providerResponse.ok || !providerResponse.body) {
      const errorText = await providerResponse.text();
      return NextResponse.json({ error: errorText || "模型流式请求失败，请稍后再试。" }, { status: providerResponse.status || 500 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = providerResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        controller.enqueue(encoderChunk("event: start\ndata: started\n\n"));

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const eventBlock of events) {
              const lines = eventBlock
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);

              for (const line of lines) {
                if (!line.startsWith("data:")) continue;

                const data = line.slice(5).trim();

                if (data === "[DONE]") {
                  controller.enqueue(encoderChunk("event: done\ndata: done\n\n"));
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data) as ProviderChunk;
                  const content = parsed.choices?.[0]?.delta?.content || "";

                  if (content) {
                    controller.enqueue(encoderChunk(`event: chunk\ndata: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch {
                  continue;
                }
              }
            }
          }

          controller.enqueue(encoderChunk("event: done\ndata: done\n\n"));
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : "流式生成失败";
          controller.enqueue(encoderChunk(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "服务端分析失败，请稍后再试。" }, { status: 500 });
  }
}
