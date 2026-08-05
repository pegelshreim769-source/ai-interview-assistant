# Interview Studio 数据处理地图

版本：任务四本地审计版
审计基线：`f9817ac`（任务三合并后的 `main`）
说明：本文件依据代码、Docker Compose 和环境模板记录当前实现事实，不构成法律意见。运营主体、供应商合同、部署区域和最终保存期限仍需产品经理及专业顾问确认。

## 1. 数据流总览

```text
浏览器输入/上传
  ├─ localStorage：面试历史、定制材料、简历草稿、客户端业务标识
  ├─ HttpOnly Cookie：Beta 会话令牌、管理员会话令牌
  └─ HTTPS 请求（部署后）→ Next.js API
       ├─ 聊天/文件接口 → 配置的 OpenAI-compatible 模型服务
       ├─ 语音接口 → 配置的 DashScope-compatible ASR 服务
       ├─ Redis → 邀请码/会话哈希、限流、预算、脱敏聚合指标
       ├─ .data/sessions → 仅服务器会话同步开启时写入完整会话
       └─ 标准输出日志 → 固定字段白名单，不含用户材料正文
```

## 2. 数据类别与实际处理

| 数据类别 | 收集或产生位置 | 处理目的 | 实际流向 | 默认持久化与期限 | 删除方式 | 第三方/待确认事项 |
|---|---|---|---|---|---|---|
| 简历 | 简历工作台、定制面试的文本框或 PDF/DOCX/TXT 上传 | 解析事实、岗位匹配、改写和定制面试 | 浏览器 → Next.js API → 聊天/文件模型；整理结果写浏览器 localStorage | 浏览器草稿持续到用户清除；应用代码不把上传文件单独写入磁盘 | `/rights` 清除本机数据；第三方副本按供应商规则处理 | 实际聊天服务商、部署区域、供应商保存/训练设置、委托处理条款待确认 |
| 岗位 JD | 简历工作台、定制面试文本框或图片上传 | 提取岗位要求、规划经历优先级和面试问题 | 浏览器 → API → 聊天/文件模型；整理结果写浏览器 localStorage | 同上 | 同上 | 同上 |
| 文字回答 | 文字练习、模拟面试、定制面试 | 分析表达、追问、生成反馈和总结 | 浏览器 → 对应 AI API → 聊天模型；模拟/定制历史写 localStorage | 本地历史保留到主动清除；文字练习当前不建立 localStorage 历史 | `/rights` 清除列明业务 Key | 供应商保存期限、训练使用设置待确认 |
| 语音 | 文字练习、模拟面试主动录音后提交 | 转写为文字 | 浏览器内存 Blob → `/api/transcribe` → ASR 服务；应用不写磁盘 | 浏览器录音 Blob 不由应用持久化；第三方处理期限未知 | 页面生命周期结束后浏览器内存释放；第三方按其规则 | ASR 服务商、区域、保存规则待确认 |
| 转写文本 | ASR 返回并进入回答草稿/历史 | 让用户校正、继续面试练习 | ASR → API → 浏览器；可能写入模拟面试 localStorage 或在后续聊天请求中发送 | 随相应本地会话保存到主动清除 | `/rights` 清除本机数据 | 如继续分析，会再次发送给聊天模型 |
| 上传文件 | PDF、DOCX、TXT、PNG、JPG、WEBP | 文件内容提取 | TXT 在应用进程内读取；其他文件上传到聊天/文件模型并获取内容 | 当前应用代码不把原文件写入 `.data`；请求期内存处理；供应商期限未知 | 应用侧无独立文件副本；供应商侧待合同确认 | 文件服务未实现 provider 文件主动删除，需确认供应商能力和保留策略 |
| 邀请码 | 服务端管理脚本创建，用户在 `/access` 提交 | 封闭 Beta 访问控制 | 明文仅创建脚本显示一次；Redis 只保存 SHA-256 哈希及状态/次数 | 邀请码记录、ID 索引和列表当前无自动 TTL | 管理脚本禁用或撤销；尚无自动清理命令 | 运营方需制定状态记录保存和清理周期 |
| Beta 会话 | 邀请码成功兑换 | 页面/API 鉴权、匿名配额归属、政策版本确认 | 浏览器 HttpOnly Cookie 保存原始不透明令牌；Redis 保存哈希、邀请 ID/哈希、创建/过期时间、接受政策版本/时间 | 默认模板 14 天；Redis Key `PEXPIREAT`；退出/过期/撤销失效 | `/api/access/logout` 或邀请码撤销；`/rights` 同时调用退出 | 不记录原始 IP、姓名、手机号或邮箱；旧政策版本需重新确认 |
| 管理员会话 | `/admin/login` | 访问脱敏费用统计 | 浏览器 HttpOnly Cookie 保存不透明令牌；Redis 保存哈希与必要元数据 | 默认模板 8 小时；Redis TTL | 管理员退出或服务端撤销 | 普通 Beta Cookie 不具备管理员权限 |
| 客户端业务标识 | `app/lib/client/session-sync.ts` 在同步启用时生成 | 关联浏览器与服务器会话文件 | localStorage → `/api/sessions/[mode]` → 文件名 | localStorage 到主动清除；`.data/sessions` 文件无自动 TTL | `/rights` 只清本机标识；当前没有安全的服务器自助删除 | 仅凭 client_id 无可靠所有权验证，生产必须保持同步关闭 |
| 服务器会话文件 | `app/lib/server/session-store.ts` | 可选的模拟/定制面试跨刷新同步 | `.data/sessions/{mode}/{client_id}.json`，内容为完整会话 | 仅 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=true` 时客户端调用；文件无 TTL，最多保留每模式 12 个会话 | 当前没有安全的用户自助删除接口 | 生产合规检查阻止开启；后续需账号归属验证、删除机制和期限 |
| 限流与费用计数 | 业务 API 保护器 | 用户/IP 分钟限流、每日配额、日/月预算、并发控制 | Redis；Key 只使用 session_hash、HMAC IP 或随机租约 ID | 用户/IP 分钟 Key 约 60 秒；邀请尝试 10 分钟；日/月 Key 到周期边界后保留缓冲 TTL；并发租约默认 10 分钟并额外 60 秒 Key TTL | TTL 自动清理；不得在生产使用 `FLUSHALL` 或删除未知 Key | 估算费用不等于供应商账单 |
| 脱敏聚合指标 | `app/lib/observability` | 运行监控、费用趋势、错误与延迟统计 | Redis Hash/HyperLogLog；活跃会话再次 HMAC；管理页只读汇总 | 默认小时 168 小时、日 90 天，可配置 | TTL 自动清理 | 不保存原始 IP、会话哈希、请求正文或精确用户轨迹 |
| 运行日志 | `app/lib/observability/logger.ts` | 故障排查和预算告警 | 标准输出 JSON → Docker json-file 日志 | Compose 按单文件 10MB、最多 3 个文件轮转；不是固定天数 | 容器日志轮转/运维删除 | 最终日志访问权限、备份和时间政策待运营方确认 |

## 3. 浏览器 localStorage 清单

任务四的清除操作只删除以下业务 Key，不调用 `localStorage.clear()`：

| Key | 内容 |
|---|---|
| `interview-lab.mock-interview.sessions` | 模拟面试问题、回答、反馈、总结及状态，最多 12 个本地会话 |
| `interview-lab.mock-interview.language` | 语音识别语言偏好 |
| `interview-lab.custom-interview.sessions` | 简历/JD 文本、解析结果、问题、回答、复盘及调试摘要，最多 12 个本地会话 |
| `interview-lab.resume-studio.session` | 简历工作台材料、事实台账、规划、改写和最终文本草稿 |
| `interview-lab.resume-studio.interview-handoff` | 从简历工作台进入定制面试的一次性交接数据 |
| `interview-lab.client-id` | 服务器会话同步使用的浏览器业务标识 |

以下是界面偏好，不在“清除本机业务数据”范围内：`interview-lab-theme`、`interview-lab-accent`。

代码未使用 `sessionStorage` 保存会话令牌或业务材料。Beta 和管理员令牌仅保存在 HttpOnly Cookie。

## 4. Redis 命名空间与内容边界

- `interview-studio:beta:*`：邀请码哈希、状态、使用次数、会话哈希和政策接受元数据。
- `interview-studio:usage:*`：哈希用户/IP 的限流、每日配额、预算、警告和并发租约。
- `interview-studio:metrics:v1:*`：小时/日聚合、模型/接口/错误类别、HMAC 活跃匿名会话估算。
- `interview-studio:admin:v1:*`：哈希管理员会话和 HMAC IP 登录尝试。

Redis 中不应出现原始邀请码、Cookie、会话令牌、原始 IP、简历、JD、回答、语音或转写全文。

## 5. 日志字段白名单

AI 请求日志仅允许：`event`、`request_id`、`timestamp`、`endpoint`、`provider_kind`、`model`、`status`、`status_class`、`outcome`、`error_code`、`duration_ms`、`units`、`estimated_cost_cents`、`stream_state`、`retryable`。

日志模块不接收请求正文。错误响应使用统一中文信息，不返回环境变量、Redis Key、服务器文件路径或异常堆栈。

## 6. `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC`

- 默认值：`false`。
- `false` 时：客户端不会调用 `/api/sessions/[mode]`，不会创建 `interview-lab.client-id`，完整会话只留在浏览器。
- `true` 时：客户端仅凭可自行持有的 client_id 读写 `.data/sessions`，缺少正式账号和可靠所有权验证。
- 任务四措施：`npm run compliance:check` 在该值为 `true` 时失败；不新增按 client_id 删除服务器文件的接口。

## 7. 待产品经理/专业顾问确认

1. 真实运营主体、联系邮箱、政策版本与日期、投诉反馈时限。
2. 实际聊天/文件模型和 ASR 服务商、模型名称、服务区域、供应商保存期限、训练使用设置及委托处理条款。
3. 是否涉及个人信息跨境提供，以及相应告知、单独同意或其他程序。
4. 邀请码状态、运行日志和未来服务器会话文件的正式保存期限与清理流程。
5. 未成年人服务边界和敏感个人信息处理规则。
6. 属地网信部门要求的算法备案、安全评估、生成式 AI 登记及 AI 内容标识范围。
7. 安全的服务器同步、用户归属验证和服务端数据自助删除方案。
