# Interview Studio

> 根据岗位 JD 重构你的简历，把经历做一次优先级排序；再用真实经历完成一轮有针对性的面试练习。

Interview Studio 是一个面向大学生、职场新人和求职者的 AI 面试练习平台。产品不替用户编造项目、指标或结果，而是把简历优化与面试训练连接成一条可核对、可追溯的准备流程。

当前产品包含两个工作区：

| 工作区 | 功能 |
| --- | --- |
| 简历工作台 | 材料确认、事实台账、撰写规划、改写策略确认、PDF / DOCX 简历和面试衔接 |
| 面试 Lab | 文字练习、模拟面试和基于简历 × JD 的定制面试 |

## 核心原则

- **不补编**：用户没有提供的经历、职责、日期、指标和结果不能写入简历或回答。
- **证据优先**：每条简历改写都必须关联事实台账中的证据编号。
- **先追问，再优化**：信息不足时暴露证据缺口或继续追问，不用“合理猜测”补齐。
- **岗位相关性优先**：根据目标 JD 对经历做选择和排序，而不是机械润色全部内容。
- **帮助用户讲清楚**：目标是让面试官快速理解背景、动作、判断和结果，不是堆砌模板化黑话。

## 产品流程

### 简历工作台

```text
上传简历与岗位 JD，并确认解析材料
→ 自动生成只读事实台账
→ 生成简历撰写规划
→ 确认分段改写策略并自动完成事实校验
→ 生成并下载 PDF / DOCX 简历
→ 进入定制模拟面试
```

简历工作台支持：

- 上传 PDF、DOCX、TXT 简历，或直接粘贴简历文本
- 粘贴岗位 JD，或上传 PNG、JPG、JPEG、WEBP 岗位截图
- 用户只确认一次解析材料；事实台账随后自动生成，不再逐条重复确认
- 记录原始证据、日期、指标、固定事实和证据编号
- 根据不同 JD 选择更相关的经历，并规划表达顺序
- 对照原文与改写结果，逐条接受、暂不采用或撤销
- 检查不存在的指标、固定事实漂移和缺失证据编号
- 将没有证据支持的内容放入“证据缺口”，而不是写入简历
- 生成可复制文本，并下载 PDF 或 DOCX 简历
- 将确认后的简历和 JD 交接给定制面试流程

方法论以版本化 TypeScript 固化，当前版本为：

```text
tailor-chinese-resumes-ts@0.1.0
```

### 文字练习

用户先输入自己真实会说出口的一版回答，系统会：

- 识别最影响面试官判断的问题
- 根据信息缺口继续追问
- 基于用户后续补充重新整理回答
- 生成更适合开口练习的版本

### 模拟面试

系统以真实面试节奏逐轮提问，用户可以使用语音回答。每次回答完成后，系统根据真实回答继续追问，并在本轮结束后统一复盘。

### 定制面试

系统根据简历与岗位 JD 的交集生成面试前 briefing，识别：

- 岗位最关注的能力
- 最值得主讲的经历
- 最可能被追问的风险点
- 更适合本轮面试的提问方向与难度

## 页面与接口

| 路径 | 说明 |
| --- | --- |
| `/resume-studio` | 简历工作台 |
| `/` | 文字练习 |
| `/mock-interview` | 模拟面试 |
| `/custom-interview` | 定制面试 |
| `/api/resume-studio` | 简历工作台独立动作 API |
| `/api/resume-studio/extract` | 简历与 JD 材料解析 |
| `/api/analyze` | 文字练习分析 |
| `/api/mock-interview` | 模拟面试生成 |
| `/api/custom-interview` | 定制面试生成 |

`/api/resume-studio` 当前支持以下动作：

- `build_fact_ledger`
- `build_resume_plan`
- `rewrite_experience`
- `validate_resume_claims`
- `finalize_resume`

## 目录结构

```text
app/
├── api/
│   ├── resume-studio/          # 简历工作台 API 与材料解析
│   ├── custom-interview/       # 定制面试 API
│   └── mock-interview/         # 模拟面试 API
├── components/
│   ├── practice-layout.tsx     # 工作区切换与共享侧边栏
│   └── resume-document.tsx     # 可下载简历的结构化预览
├── lib/
│   ├── resume-studio/          # 方法论、提示词、校验、存储与导出
│   └── server/                 # 服务端材料提取能力
├── resume-studio/              # 简历工作台页面
├── custom-interview/           # 定制面试页面
└── mock-interview/             # 模拟面试页面

public/resume-studio/            # 简历工作台视觉资源
design-qa.md                     # 桌面与移动端视觉检查记录
```

## 技术栈

- Next.js 15、React 18、TypeScript
- 原生 CSS 变量与响应式布局
- Phosphor Icons
- `pdf-parse`、`mammoth`、`tesseract.js`
- OpenAI-compatible Chat API
- DashScope 语音转写
- Browser localStorage（默认历史记录与工作台草稿）
- Node Test Runner + `tsx`

## 本地运行

要求：Node.js 20.9+；生产部署建议使用 Node.js 22 LTS。

```bash
npm install
cp .env.example .env.local
npm run dev
```

启动后访问：

```text
http://localhost:3000/resume-studio
```

## 环境变量

```bash
OPENAI_API_KEY=your_chat_api_key_here
OPENAI_BASE_URL=https://api.moonshot.cn/v1
OPENAI_MODEL=kimi-k2.5

DASHSCOPE_API_KEY=your_asr_api_key_here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_ASR_MODEL=qwen3-asr-flash

NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=false
```

建议在 Beta 阶段保持 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=false`，优先使用浏览器本地存储。

## 开发命令

```bash
npm run dev        # 启动本地开发服务
npm run lint       # ESLint 检查
npm run typecheck  # TypeScript 类型检查
npm test           # 简历事实与证据校验测试
npm run build      # 生产构建
npm run start      # 启动生产服务
```

## 中国境内部署

仓库已包含可重复部署所需的生产配置：

- `Dockerfile`：构建 Next.js standalone 生产镜像
- `compose.production.yml`：单机容器编排、健康检查与数据卷
- `deploy/nginx/interview-studio.conf`：HTTPS 反向代理、上传限制和基础接口限流
- `/api/health`：不访问第三方服务、不泄露密钥的健康检查接口
- `docs/deployment-cn.md`：从域名备案、服务器准备到发布和回滚的操作手册

正式上线前先复制生产环境变量模板，并只在服务器本地填写密钥：

```bash
cp .env.production.example .env.production
docker compose -f compose.production.yml up -d --build
```

服务默认仅绑定服务器的 `127.0.0.1:3000`，公网流量应通过 Nginx 和 HTTPS 进入。不要将 `.env.production` 提交到 Git。

测试场景覆盖：

- 不编造不存在的指标
- 固定日期和身份事实不漂移
- 改写结果必须关联有效证据编号
- 证据缺口正确暴露
- 互联网 AI 与央国企 JD 的经历选择差异
- Agent 要求缺少经历证据时不强行写入简历

## 隐私与数据

- 请勿上传身份证号、详细住址、银行信息、公司机密或未公开业务数据。
- 简历、JD、文字回答和语音转写内容会发送给项目配置的 AI、OCR 或 ASR 服务处理。
- 建议在上传前移除手机号、私人邮箱、照片和其他与练习无关的个人信息。
- 历史记录和简历工作台草稿默认保存在当前浏览器；清除站点数据后会一并移除。
- 服务器会话同步默认关闭，仅在显式设置 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=true` 后启用。

## 当前限制

- PDF 由浏览器端排版生成；复杂模板和精细分页仍会继续优化。
- OCR、文件提取和语音转写效果受材料质量、浏览器权限与网络状态影响。
- 当前没有账号体系，不同设备之间不会自动同步本地记录。
- 这是 Beta 版本，提示词、追问质量和定制面试稳定性仍会持续迭代。

## Roadmap

- 更多 ATS 友好模板与精细分页控制
- 更稳定的语音链路与面试官语音
- 多轮岗位面试复盘
- 岗位风格切换
- 用户系统与跨设备历史记录
