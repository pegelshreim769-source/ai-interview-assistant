# AI Interview Assistant

一个面向真实面试练习场景的 AI Web 工具。

它不是“帮你编漂亮答案”的生成器，而是一个会先判断信息是否足够、信息不足时继续追问、信息足够时再帮你整理练习版本的对话式面试助手。

## 产品定位

这个产品的目标是帮助用户反复练习真实面试回答，而不是一次性输出一份冗长报告。

核心体验是：

1. 用户先输入一版自己真实会说出口的回答
2. AI 判断这版回答是否信息充分
3. 如果信息不足，AI 先追问关键缺口
4. 用户补充真实信息
5. AI 基于“原回答 + 补充信息”继续生成下一轮反馈
6. 只有信息足够时，才生成“可直接开口练的版本”

## 当前能力

- 单页、对话式的面试练习界面
- 支持真实 AI 分析，不再使用 mock 数据
- 支持流式生成反馈
- 支持多轮对话，不覆盖历史回答和历史评分
- 在信息不足时优先追问，而不是直接代写
- 基于五维规则判断是否允许生成练习版本
- 生成评分、最大问题、追问问题、改进建议、练习版本

## 判定原则

系统会优先判断当前回答是否足够支撑一个“真实、可信、可练习”的版本。

判断维度包括：

- 背景/任务
- 个人动作
- 方法/过程
- 结果/价值
- 清晰度/具体度

硬门槛规则：

- 如果缺背景/任务，必须先追问
- 如果缺个人动作，必须先追问
- 如果缺结果/价值，必须先追问
- 如果表达过于模糊，无法支撑真实理解，必须先追问

只有在核心信息足够时，才允许生成练习版本。

## 产品原则

- 不补编用户没有提供的项目背景、数据、结果、角色或方法
- 宁可先追问，也不脑补
- 练习版本只能基于用户真实输入整理
- 每轮补充都会生成一条新的 AI 回复，不覆盖原始回答和上一轮结果

## 技术栈

- Next.js 14
- React 18
- TypeScript
- App Router

## 本地运行

1. 复制环境变量模板：

```bash
cp .env.example .env.local
```

2. 在 `.env.local` 中填写模型配置。

当前项目支持 OpenAI 兼容接口，默认读取：

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

3. 安装依赖并启动：

```bash
npm install
npm run dev
```

4. 打开浏览器访问：

```text
http://127.0.0.1:3000
```

## 环境变量

`.env.example` 示例：

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.4-mini
```

项目也可以接 Moonshot / Kimi 这类兼容 OpenAI Chat Completions 的模型服务。

## 目录结构

```text
app/
  api/
    analyze/
      route.ts
  globals.css
  layout.tsx
  page.tsx
package.json
tsconfig.json
next.config.mjs
```

## 当前页面形态

当前版本已经重构成：

- 单列对话流页面
- 首屏轻量聊天输入区
- AI 回复按轮次保留历史
- 追问模块中可直接补充真实信息
- 补充后生成新一轮问答，不覆盖旧结果

## 输出结构

服务端当前使用结构化 JSON 输出，核心字段包括：

- `mode`
- `judgement`
- `reason`
- `score`
- `main_issue`
- `follow_up_questions`
- `actionable_suggestions`
- `practice_version`

其中：

- `mode = ask_followup` 时，不生成练习版本
- `mode = generate_practice` 时，才生成练习版本

## 注意事项

- `.env.local` 已被 `.gitignore` 忽略，不会被提交
- 不建议在 `next dev` 运行时同时执行 `next build`，否则可能污染 `.next` 目录并导致开发态 chunk 错误
