# AI面试助手

一个基于 Next.js 的 Web 产品原型，用来对用户的面试回答生成结构化反馈和优化建议。

## 当前能力

- 输入一段面试回答
- 调用真实 AI 进行面试分析
- 按固定结构输出分析报告
- 输出原句锚点问题定位
- 生成优化后的示例回答

## 技术栈

- Next.js 14
- React 18
- TypeScript
- App Router

## 本地启动

先复制环境变量：

```bash
cp .env.example .env.local
```

然后在 `.env.local` 中填写你的 `OPENAI_API_KEY`。

再在项目目录执行：

```bash
npm install
npm run dev
```

然后打开 [http://localhost:3000](http://localhost:3000)。

## 项目结构

```text
app/
  globals.css
  layout.tsx
  page.tsx
package.json
tsconfig.json
next.config.mjs
```

## AI 输出结构

服务端会强制模型按固定 JSON 结构返回，包含：

- 总体评价
- 四项评分及理由
- 结构 / 内容 / 表达的具体分析
- 至少 3 条原句锚点分析
- 改进建议
- 优化后的回答

## 下一步建议

- 增加岗位类型、题型类型、语气风格等输入项
- 支持历史记录、复制优化答案、导出结果
- 加入流式输出和分析生成中的骨架屏体验
