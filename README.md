# Interview Studio

> 根据岗位 JD 重构你的简历，把经历做一次优先级排序；再用真实经历完成一轮有针对性的面试练习。

Interview Studio 是一个面向大学生、职场新人和求职者的 AI 面试练习平台。产品不替用户编造项目、指标或结果，而是把简历优化与面试训练连接成一条可核对、可追溯的准备流程。

当前版本为封闭 Beta。四个产品工作区和所有业务 API 均需要有效邀请码会话；系统不要求手机号、姓名或邮箱，也不建设正式账号体系。

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
| `/access` | 封闭 Beta 邀请码入口 |
| `/privacy` | 隐私政策与实际数据处理说明 |
| `/terms` | 用户协议与 AI 辅助内容使用规则 |
| `/rights` | 本机数据清除、个人信息请求与投诉入口 |
| `/ai-disclosure` | AI 服务商、模型、数据发送与标识范围公示 |
| `/admin/login` | 独立管理员登录 |
| `/admin/usage` | 仅含匿名聚合数据的用量与费用看板 |
| `/api/access/redeem` | 兑换邀请码并建立会话 |
| `/api/access/session` | 检查当前封闭测试会话 |
| `/api/access/logout` | 注销当前封闭测试会话 |
| `/api/access/accept` | 旧会话或政策更新后的重新确认 |
| `/api/health` | 公开健康检查 |
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

REDIS_URL=redis://127.0.0.1:6379
BETA_SESSION_DAYS=14

BETA_USER_AI_RPM=5
BETA_IP_AI_RPM=20
BETA_USER_DAILY_UNITS=60
BETA_GLOBAL_AI_CONCURRENCY=8
BETA_ESTIMATED_CNY_PER_UNIT=0.20
BETA_DAILY_AI_BUDGET_CNY=20
BETA_MONTHLY_AI_BUDGET_CNY=300
BETA_BUDGET_TIMEZONE=Asia/Shanghai
BETA_IP_HASH_SECRET=replace_with_a_long_random_secret
BETA_METRICS_HOURLY_RETENTION_HOURS=168
BETA_METRICS_DAILY_RETENTION_DAYS=90
ADMIN_ACCESS_TOKEN_HASH=replace_with_generated_sha256_hash
ADMIN_SESSION_HOURS=8

PUBLIC_OPERATOR_NAME=replace_with_operator_name
PUBLIC_CONTACT_EMAIL=replace_with_contact_email
PUBLIC_POLICY_VERSION=replace_with_policy_version
PUBLIC_POLICY_EFFECTIVE_DATE=replace_with_yyyy_mm_dd
PUBLIC_POLICY_UPDATED_DATE=replace_with_yyyy_mm_dd
PUBLIC_AI_PROVIDER_NAME=replace_with_ai_provider_name
PUBLIC_CHAT_MODEL_NAME=replace_with_chat_model_name
PUBLIC_ASR_PROVIDER_NAME=replace_with_asr_provider_name
PUBLIC_ASR_MODEL_NAME=replace_with_asr_model_name
PUBLIC_MODEL_FILING_INFO=replace_with_verified_filing_info
PUBLIC_COMPLAINT_RESPONSE_DAYS=replace_with_response_days
```

建议在 Beta 阶段保持 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=false`，优先使用浏览器本地存储。

`REDIS_URL` 和 `BETA_SESSION_DAYS` 仅在服务端使用。生产 Compose 中应使用 `redis://redis:6379`；浏览器 Cookie 只保存不可预测的会话令牌，令牌不会写入 localStorage 或 sessionStorage。

`BETA_IP_HASH_SECRET` 也只允许在服务端使用。生产环境必须替换模板值，并使用至少 32 字节的安全随机密钥，例如：

```bash
openssl rand -hex 32
```

生产环境缺少密钥、限额或预算配置非法，以及 Redis 不可用时，高费用请求都会默认拒绝并返回 HTTP 503，不会退化成无限调用。

## Beta 限流、配额与预算保护

所有 AI 业务接口统一执行以下服务端保护，不依赖按钮状态或浏览器存储：

- 单个匿名会话每分钟最多 `BETA_USER_AI_RPM` 次，默认 5 次。
- 单个可信 IP 每分钟最多 `BETA_IP_AI_RPM` 次，默认 20 次。
- 单个匿名会话每天最多 `BETA_USER_DAILY_UNITS` 个费用单位，默认 60；按 `BETA_BUDGET_TIMEZONE` 的自然日重置。
- 全站最多同时执行 `BETA_GLOBAL_AI_CONCURRENCY` 个 AI 请求，默认 8。
- 邀请码兑换按 IP 每 10 分钟最多尝试 5 次。
- 日/月预算分别由 `BETA_DAILY_AI_BUDGET_CNY` 与 `BETA_MONTHLY_AI_BUDGET_CNY` 设置。

费用单位集中配置如下：

| 接口 | 单次单位 | 高费用 |
| --- | ---: | --- |
| `/api/analyze` | 1 | 否 |
| `/api/mock-interview` | 1 | 否 |
| `/api/custom-interview` | 2 | 是 |
| `/api/custom-interview/extract` | 2 | 是 |
| `/api/resume-studio` | 2 | 是 |
| `/api/resume-studio/extract` | 2 | 是 |
| `/api/transcribe` | 2 | 是 |
| `/api/mock-interview/transcribe` | 2 | 是 |

`/api/sessions/[mode]`、`/api/access/*` 和 `/api/health` 不消耗费用单位。分钟请求计数在参数解析前累计；通过鉴权、分钟限制和并发检查后，费用单位会在业务处理开始前原子预扣，因此进入 Handler 后即使参数错误或第三方调用失败也不会退还。鉴权或费用保护本身失败不会扣减。

估算金额按 `BETA_ESTIMATED_CNY_PER_UNIT` 转换为整数“分”累计。它只是产品保护用的固定估算，**不等于模型厂商实际账单**：

- 低于 70%：正常服务。
- 达到 70%：继续服务，每个日/月周期只记录一次脱敏 warning。
- 达到 90%：暂停所有 2 单位高费用功能，1 单位功能继续服务。
- 达到 100%：拒绝所有新的 AI 请求；页面、邀请码、退出、历史记录与健康检查仍可用。

调整限制时只修改服务端环境变量并重启应用，不要把真实密钥提交到 Git。测试环境需要重置时，只删除 `interview-studio:usage-test:*` 或明确测试命名空间的 Key；生产环境不得执行 `FLUSHALL`，也不要随意删除全部 `interview-studio:usage:*` Key。

## 脱敏日志、聚合指标与管理页面

每个受保护的 AI 请求都会由服务端生成随机 UUID，并通过 `X-Request-ID` 返回。标准输出只写单行 JSON，字段白名单为：`event`、`request_id`、`timestamp`、`endpoint`、`provider_kind`、`model`、`status`、`status_class`、`outcome`、`error_code`、`duration_ms`、`units`、`estimated_cost_cents`、`stream_state`、`retryable`。

系统不会把简历、JD、面试回答、语音或转写全文、上传文件、提示词、模型响应、API Key、Cookie、邀请码、邀请码哈希、管理员令牌、原始 IP、完整会话哈希、完整邀请 ID、请求头全集、请求体、用户查询参数、异常堆栈或带密码的 Redis 地址写入日志、指标或管理页面。

Redis 只保存小时和自然日聚合：小时默认保留 168 小时，日指标默认保留 90 天；每日活跃匿名会话使用二次 HMAC 后写入 HyperLogLog，不形成可枚举用户列表。管理页面支持今天、最近 7 天和最近 30 天，展示请求、成功率、429/503、内部错误分类、接口与模型汇总、费用单位、整数分估算费用、平均/P95 延迟及任务二真实日/月预算状态。估算费用基于固定费用单位，不等于模型厂商实际账单；当前暂无可靠的精确 Token 统计。

管理员身份独立于 Beta 邀请码。生成至少 256 bit 的令牌及其哈希：

```bash
npm run admin:token:create
# 将一次性输出的 ADMIN_ACCESS_TOKEN_HASH 写入服务端环境变量，再重启应用
```

明文令牌只显示一次，不会自动写入文件。管理员在 `/admin/login` 输入令牌后获得独立的 `HttpOnly`、生产环境 `Secure`、`SameSite=Strict` Cookie，会话默认 8 小时。Cookie 的 `Path=/` 是为了同时覆盖 `/admin/*` 页面与 `/api/admin/*` 接口，不与 Beta Cookie 共用名称或验证逻辑。单个可信 IP 每 15 分钟最多尝试 5 次；Redis 或生产配置不可用时默认拒绝。撤销当前令牌关联的全部会话：

```bash
npm run admin:sessions:revoke
# 生产 Compose：
docker compose -f compose.production.yml run --rm admin-tools sessions-revoke
```

Docker 的 app 与 Redis 使用 `json-file` 日志驱动，单文件最多 10 MB、最多 3 个文件。查看日志使用 `docker compose -f compose.production.yml logs app redis`。只可定向删除明确测试前缀（例如 `interview-studio:metrics:test:*`）；不得使用 `FLUSHALL` 或 `KEYS *` 清理生产数据。

## 隐私、协议确认与 AI 信息公示

四个工作区、邀请码页和四个公共政策页底部均提供稳定入口。工作区使用共享提示显示“AI 辅助生成，仅供求职练习，请人工核验。”当前界面提示不代表已经满足所有导出文件显式或隐式元数据标识要求，技术差距记录在 `docs/ai-content-labeling-gap.md`。

邀请码兑换要求用户主动勾选用户协议和隐私政策，API 同时校验当前 `PUBLIC_POLICY_VERSION`。Redis 的 Beta 会话仅新增政策版本与接受时间，不记录原始 IP 或用户材料。旧会话或政策版本变化时会返回 `/access` 重新确认；保留原会话并通过 `/api/access/accept` 更新确认，不重复消耗邀请码。确认前不能访问工作区或业务 API。

`/rights` 的“清除本机数据”只删除项目列明的 6 个业务 localStorage Key，不调用 `localStorage.clear()`，因此不会删除主题偏好或其他网站数据；清除后同时注销 Beta 会话。投诉表单只在浏览器生成 `mailto:`，不写入服务器日志、Redis 或数据库。

服务器会话同步仍只依赖 `client_id`，缺少正式账号归属验证。生产必须保持 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=false`，任务四没有增加按 client_id 删除文件的不安全接口。完整数据流、TTL 和待确认事项见 `docs/compliance-data-map.md`。

公开运营信息只从服务端环境变量读取，不使用 `NEXT_PUBLIC_`。普通 `npm run build` 允许占位配置，便于本地开发；正式上线前必须填写真实信息并运行：

```bash
npm run compliance:check
```

缺失值、占位符、非法邮箱/日期/版本/反馈天数，或 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=true` 都会使检查失败。必须由产品经理确认运营主体、联系邮箱、政策日期、实际服务商和模型、备案或登记信息及反馈时限；这些页面和技术措施不构成法律意见，也不能作为“已经合规上线”的结论。

## 封闭 Beta 邀请码

邀请码和会话只以 SHA-256 哈希形式存入 Redis。邀请码明文只在创建成功时显示一次，请通过安全渠道交付；之后无法从 Redis 恢复。

本地或能直接访问 `REDIS_URL` 的环境可以运行：

```bash
# 创建默认单次、永不过期的邀请码
npm run invite:create

# 创建 14 天有效、最多可兑换 5 次的邀请码
npm run invite:create -- --expires-in-days 14 --max-uses 5

# 也可以指定 ISO 到期时间
npm run invite:create -- --expires-at 2026-09-01T00:00:00+08:00 --max-uses 1

# 查看状态，不显示邀请码明文或哈希
npm run invite:list

# 禁止继续兑换；已有会话也会在下一次鉴权时失效
npm run invite:disable -- <invite-id>

# 撤销邀请码并立即删除全部关联会话
npm run invite:revoke -- <invite-id>
```

生产 Compose 中 Redis 不暴露宿主机端口，应通过一次性工具容器执行同样操作：

```bash
docker compose -f compose.production.yml run --rm invite-admin create --expires-in-days 14 --max-uses 5
docker compose -f compose.production.yml run --rm invite-admin list
docker compose -f compose.production.yml run --rm invite-admin disable <invite-id>
docker compose -f compose.production.yml run --rm invite-admin revoke <invite-id>
```

`/api/health` 保持公开。其他业务 API 在无会话或会话失效时统一返回 HTTP 401；Redis 或鉴权服务异常时默认拒绝访问并返回 HTTP 503。

## 开发命令

```bash
npm run dev        # 启动本地开发服务
npm run lint       # ESLint 检查
npm run typecheck  # TypeScript 类型检查
npm test           # 简历事实与证据校验测试
npm run compliance:check # 上线前公开运营信息与会话同步门槛检查
npm run test:redis-usage # 在 REDIS_URL 指向的测试 Redis 中验证 Lua 原子操作
npm run build      # 生产构建
npm run start      # 启动生产服务
npm run invite:create  # 创建封闭 Beta 邀请码
npm run invite:list    # 查看邀请码状态
npm run invite:disable -- <invite-id> # 禁用邀请码
npm run invite:revoke -- <invite-id>  # 撤销邀请码及关联会话
```

容器级 HTTP 验收器只允许在隔离测试环境运行，并要求显式设置 `BETA_ACCEPTANCE_TEST=true`。它会清理隔离环境中的 `interview-studio:usage:*` 测试计数，禁止在生产环境启用：

```bash
docker compose --profile tools -f compose.production.yml run --rm beta-usage-http-test rate
docker compose --profile tools -f compose.production.yml run --rm beta-usage-http-test quota
docker compose --profile tools -f compose.production.yml run --rm beta-usage-http-test budget

# 仅在 Redis 已停止时验证 fail-closed；不读取或清理 Redis
docker compose --profile tools -f compose.production.yml run --rm --no-deps beta-usage-http-test redis-unavailable
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
- 历史记录和简历工作台草稿默认保存在当前浏览器；可在 `/rights` 只清除本项目业务数据。
- 服务器会话同步默认关闭，仅在显式设置 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=true` 后启用。
- 生产合规检查会阻止开启当前缺少安全所有权验证的服务器会话同步。
- 隐私政策、用户协议和 AI 公示需要在上线前由产品经理与专业顾问结合真实运营配置审阅。

## 当前限制

- PDF 由浏览器端排版生成；复杂模板和精细分页仍会继续优化。
- OCR、文件提取和语音转写效果受材料质量、浏览器权限与网络状态影响。
- 当前没有账号体系，不同设备之间不会自动同步本地记录。
- 封闭 Beta 会话依赖 Redis；Redis 不可用时页面与业务 API 会默认拒绝访问，健康检查仍保持公开。
- AI 限流、日额度、预算和并发租约依赖 Redis 持久化；Redis 不可用时 AI API 与邀请码兑换默认拒绝，健康检查仍公开。
- 这是 Beta 版本，提示词、追问质量和定制面试稳定性仍会持续迭代。

## Roadmap

- 更多 ATS 友好模板与精细分页控制
- 更稳定的语音链路与面试官语音
- 多轮岗位面试复盘
- 岗位风格切换
- 用户系统与跨设备历史记录
