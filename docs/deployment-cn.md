# Interview Studio 中国境内部署手册

## 1. 推荐架构

封闭 Beta 采用单机架构：境内云服务器运行 Docker，Nginx 负责 HTTPS、反向代理与写入可信客户端地址，Next.js standalone 容器同时承载页面和 API。Redis 只在 Compose 内部网络保存邀请码/会话哈希、哈希后的限流标识、费用计数和并发租约。

```text
用户 → 域名与 HTTPS → Nginx → Next.js 容器 → 大模型 / 语音服务
                              ↕
                         内部 Redis 容器
```

这一阶段保持 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=false`，用户草稿与历史记录仍以浏览器本地存储为主。`.data` 数据卷只为后续开启会话同步预留，不应被视为正式数据库。

## 2. 上线前置条件

- 准备中国境内云服务器、域名和 DNS 解析。
- 使用中国境内服务器公开提供网站服务前，完成适用的 ICP 备案；上线后按适用要求办理公安联网备案。
- 准备 HTTPS 证书，并在页面提供隐私政策、用户协议、内容反馈或投诉入口。
- 明确向用户告知：简历、JD、回答和语音会发送到所配置的 AI、OCR 或 ASR 服务。
- 确认所选模型与语音服务在服务器所在地域可稳定访问，并为密钥设置余额告警、调用限额和轮换方案。

## 3. 服务器准备

建议使用 2 核 4 GB 起步配置，安装 Docker、Docker Compose 与 Nginx，并只对公网开放 22、80、443 端口。应用端口 3000 只绑定到 `127.0.0.1`。

将代码放到服务器后创建生产密钥文件：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

编辑 `.env.production`，替换模型密钥和 `BETA_IP_HASH_SECRET`，并保持 `REDIS_URL=redis://redis:6379`。可以用 `openssl rand -hex 32` 生成 IP HMAC 密钥。`BETA_SESSION_DAYS` 用于设置封闭测试会话有效天数。不得将真实密钥提交到 Git、写进镜像或发送到前端。

同时填写以下公开运营信息。它们由服务器在请求时读取，不应使用 `NEXT_PUBLIC_`：

| 变量 | 上线前确认人 | 含义 |
| --- | --- | --- |
| `PUBLIC_OPERATOR_NAME` | 产品经理/运营方 | 真实运营主体名称 |
| `PUBLIC_CONTACT_EMAIL` | 产品经理/运营方 | 个人信息请求和投诉邮箱 |
| `PUBLIC_POLICY_VERSION` | 产品经理/专业顾问 | 当前协议与政策版本；变化后会要求重新确认 |
| `PUBLIC_POLICY_EFFECTIVE_DATE` | 产品经理/专业顾问 | 生效日期，`YYYY-MM-DD` |
| `PUBLIC_POLICY_UPDATED_DATE` | 产品经理/专业顾问 | 更新日期，`YYYY-MM-DD` |
| `PUBLIC_AI_PROVIDER_NAME` | 产品经理/采购 | 实际聊天及文件解析服务商 |
| `PUBLIC_CHAT_MODEL_NAME` | 产品经理/工程 | 实际聊天模型名称 |
| `PUBLIC_ASR_PROVIDER_NAME` | 产品经理/采购 | 实际语音识别服务商 |
| `PUBLIC_ASR_MODEL_NAME` | 产品经理/工程 | 实际语音识别模型名称 |
| `PUBLIC_MODEL_FILING_INFO` | 专业顾问/运营方 | 经核验的备案或登记信息；不得编造 |
| `PUBLIC_COMPLAINT_RESPONSE_DAYS` | 产品经理/专业顾问 | 对外展示的预计反馈自然日，1—90 |

填写后必须运行：

```bash
npm run compliance:check
```

检查会拒绝缺失值、模板占位符、非法格式及 `NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=true`。普通 `npm run build` 不因占位信息失败，但没有通过合规配置检查不得进入正式发布流程。

费用保护变量及默认值：

| 变量 | 默认值 | 含义 |
| --- | ---: | --- |
| `BETA_USER_AI_RPM` | 5 | 单个匿名会话每分钟 AI 请求数 |
| `BETA_IP_AI_RPM` | 20 | 单个 IP 每分钟 AI 请求数 |
| `BETA_USER_DAILY_UNITS` | 60 | 单会话每日费用单位 |
| `BETA_GLOBAL_AI_CONCURRENCY` | 8 | 全站 AI 并发租约数 |
| `BETA_ESTIMATED_CNY_PER_UNIT` | 0.20 | 每单位估算人民币金额 |
| `BETA_DAILY_AI_BUDGET_CNY` | 20 | 全站每日估算预算 |
| `BETA_MONTHLY_AI_BUDGET_CNY` | 300 | 全站每月估算预算 |
| `BETA_BUDGET_TIMEZONE` | Asia/Shanghai | 日/月周期时区 |
| `BETA_IP_HASH_SECRET` | 无可用生产默认值 | 规范化 IP 的 HMAC 密钥 |

所有金额在应用内部按整数“分”累计，固定费用估算不等于模型厂商实际账单。生产配置非法、HMAC 密钥缺失或 Redis 异常时，AI 请求和邀请码兑换会默认拒绝并返回 503。

## 4. 首次发布

```bash
npm run compliance:check
docker compose -f compose.production.yml build
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
curl --fail http://127.0.0.1:3000/api/health
```

健康接口应返回 `status: ok`。它只检查应用进程，不会主动调用第三方 AI 服务，因此不会产生模型费用，也不会泄露服务配置。

Redis 服务没有配置 `ports`，不能从宿主机或公网直接访问；数据通过 `redis_data` 卷持久化。应用在 Redis 不可用时默认拒绝页面访问和业务 API 请求，`/api/health` 仍保持公开。

可在测试 Redis 中验证限流、配额和并发 Lua 脚本：

```bash
docker compose -f compose.production.yml run --rm beta-usage-redis-test
```

脚本使用随机测试命名空间并在结束后清理。不要在生产 Redis 执行 `FLUSHALL`；若需要重置测试额度，只删除明确的 `interview-studio:usage-test:*` 测试 Key。生产限额调整应修改环境变量并重启应用，不应通过删除计数绕过保护。

另提供容器级 HTTP 验收器，可验证邀请码、用户/IP 限流、日配额、预算和 Redis 停机行为。它必须使用独立测试 Redis 和 `BETA_ACCEPTANCE_TEST=true`，因为 `rate`、`quota`、`budget` 模式会清理该隔离环境的 `interview-studio:usage:*` 计数；严禁在生产环境启用该开关。`redis-unavailable` 模式不访问 Redis，可在 Redis 已停止时用 `--no-deps` 验证受保护 API 默认拒绝而健康检查保持公开。

## 5. 管理封闭 Beta 邀请码

生产环境使用 Compose 内的一次性工具容器，不需要开放 Redis 端口：

```bash
# 创建 14 天有效、最多兑换 5 次的邀请码；明文只显示一次
docker compose -f compose.production.yml run --rm invite-admin create --expires-in-days 14 --max-uses 5

# 查看状态
docker compose -f compose.production.yml run --rm invite-admin list

# 禁用邀请码；现有会话随即无法通过鉴权
docker compose -f compose.production.yml run --rm invite-admin disable <invite-id>

# 撤销邀请码并删除所有关联会话
docker compose -f compose.production.yml run --rm invite-admin revoke <invite-id>
```

命令输出不会显示邀请码哈希、会话令牌或 Cookie。除创建命令的单次明文输出外，不应把邀请码写入终端日志、部署脚本或 Git。

## 6. 配置 Nginx 与 HTTPS

复制 `deploy/nginx/interview-studio.conf` 到服务器 Nginx 配置目录，将 `interview.example.com` 替换为真实域名。先检查配置再重新加载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

配置文件初始提供 Nginx 基础流量保护，应用层另有会话/IP 分钟限制、日额度、并发和预算熔断。Nginx 会覆盖外部传入的转发链并用 `$remote_addr` 写入 `X-Real-IP`；Next.js 只信任该头，不读取客户端提供的第一个 `X-Forwarded-For`。应用仅绑定 `127.0.0.1:3000`，不得绕过 Nginx 暴露公网。上传体积上限为 6 MB，AI 接口超时 180 秒。

IP 识别规则：合法 IPv4 会规范化十进制分段，IPv6 会压缩并转为小写后再做 HMAC；无效地址、逗号分隔的转发链和生产环境缺失 `X-Real-IP` 都会默认拒绝。仅在本地非生产开发且缺少该头时使用 `127.0.0.1` 作为明确回退。Redis 计数 Key 永远不保存原始地址。

费用单位与预算行为：

| 接口 | 单位 | 类型 |
| --- | ---: | --- |
| `/api/analyze`、`/api/mock-interview` | 1 | 低费用 |
| `/api/custom-interview`、`/api/custom-interview/extract` | 2 | 高费用 |
| `/api/resume-studio`、`/api/resume-studio/extract` | 2 | 高费用 |
| `/api/transcribe`、`/api/mock-interview/transcribe` | 2 | 高费用 |

- 70%：服务继续，每个周期只输出一次不包含用户材料、IP、会话或邀请码的告警。
- 90%：拒绝 2 单位功能，允许 1 单位功能。
- 100%：拒绝新的 AI 请求，非 AI 页面与接口继续工作。

分钟请求计数包含参数错误请求。费用单位在业务 Handler 开始前原子预扣；鉴权或保护失败不扣减，进入 Handler 后失败不退还。日/月周期按 `BETA_BUDGET_TIMEZONE` 计算。

## 7. 发布检查

- 桌面端与手机端能够打开四个工作区。
- PDF、DOCX、TXT 简历和 JD 图片可正常解析。
- 简历工作台完整流程可生成事实台账、改写结果和下载文件。
- 文字练习、模拟面试、定制面试可获得模型响应。
- 麦克风权限、语音上传和转写在 HTTPS 域名下正常。
- 浏览器控制台没有密钥、完整提示词或用户材料泄漏。
- 服务端日志不记录简历正文、JD 原文、语音内容或密钥。
- `/api/health` 正常，异常接口返回可理解的提示。
- 未登录访问四个工作区时进入 `/access`，业务 API 返回 HTTP 401。
- 有效邀请码可建立 HttpOnly Cookie 会话，退出、禁用和撤销后会话失效。
- `/access` 未勾选协议时不能提交；直接调用兑换 API 未确认或使用错误政策版本时被拒绝。
- 政策版本更新后旧 Beta 会话回到 `/access` 重新确认，不重复消耗邀请码。
- `/privacy`、`/terms`、`/rights`、`/ai-disclosure` 均返回 200，桌面与手机没有横向溢出。
- `/rights` 只删除列明业务 localStorage Key，保留主题设置，并同时退出 Beta 会话。
- 四个工作区均显示统一 AI 辅助提示，公共页和邀请码页底部入口可用。
- `npm run compliance:check` 通过，服务器会话同步保持关闭。
- Redis 容器没有宿主机端口映射，Redis 中不存在邀请码或会话令牌明文。
- 外部伪造 `X-Real-IP` / `X-Forwarded-For` 不会覆盖 Nginx 写入的真实连接地址，Redis 只出现 IP HMAC。
- 5 次/分钟用户限制、20 次/分钟 IP 限制、60 单位日额度和 8 并发保护符合环境配置。
- 使用测试预算验证 90% 高费用降级与 100% 全量熔断；验证 `/api/health` 和历史记录不受影响。
- 停止 Redis 后，AI API 和邀请码兑换返回 503；恢复后持久化计数仍存在。

## 8. 更新与回滚

每次发布前记录当前 Git 提交号并保留上一个镜像标签。完成类型检查、测试与生产构建后再部署：

```bash
npm run typecheck
npm test
npm run build
npm run compliance:check
docker compose -f compose.production.yml up -d --build
```

更新后立即执行健康检查和核心流程冒烟测试。若失败，切回上一个已验证提交或镜像，再重新启动服务；不要在生产容器内直接修改代码。

## 9. 公测前仍需完成

- 增加正式监控告警接收端；当前 70% warning 仅输出一次脱敏服务端日志。
- 由产品经理和专业顾问确认真实运营主体、政策日期、模型/服务商、备案或登记信息与投诉反馈时限。
- 制定邀请码状态、运行日志、供应商副本及未来服务器会话的正式保存和删除周期。
- 完成安全的服务器会话所有权验证和用户自助删除机制；确认前保持同步关闭。
- 根据 `docs/ai-content-labeling-gap.md` 确认 PDF、DOCX、复制文本的显式/隐式标识要求。
- 确认属地算法备案、安全评估、生成式 AI 登记、跨境及未成年人要求。
- 制定密钥轮换、数据备份和安全事件响应流程。
- 若开启账号或跨设备同步，将文件会话存储迁移到数据库与对象存储。
- 对隐私政策、AI 生成内容标识、备案和数据处理安排进行正式合规审查。

# 管理指标与脱敏日志

生产环境必须额外设置 `BETA_METRICS_HOURLY_RETENTION_HOURS=168`、`BETA_METRICS_DAILY_RETENTION_DAYS=90`、`ADMIN_SESSION_HOURS=8` 和由 `npm run admin:token:create` 生成的 `ADMIN_ACCESS_TOKEN_HASH`。明文管理员令牌只通过安全渠道保存，不写入 Git、日志或浏览器存储。

访问 `/admin/login` 建立独立 Redis 管理会话后，可在 `/admin/usage` 查看匿名聚合指标。登录按 Nginx 覆盖写入的 `X-Real-IP` 做 HMAC 限制，每个 IP 15 分钟最多 5 次；Redis 或管理配置异常时默认拒绝。使用 `npm run admin:sessions:revoke`（Compose 中为 `docker compose -f compose.production.yml run --rm admin-tools sessions-revoke`）可撤销当前管理员哈希关联的全部会话。

应用只输出字段白名单单行 JSON，不记录简历、JD、回答、语音/转写、提示词、模型响应、请求体、请求头全集、Cookie、邀请码、令牌、原始 IP、完整匿名标识、异常堆栈或 Redis 密码。指标使用 `interview-studio:metrics:v1` 的小时/日 Hash 与匿名 HyperLogLog，默认分别保留 168 小时和 90 天。估算费用来自任务二预算总账和固定费用单位，不等于模型厂商实际账单。

app 与 Redis 容器日志均配置为 `json-file`，`max-size=10m`、`max-file=3`。查看方式：

```bash
docker compose -f compose.production.yml logs --tail=200 app redis
```

测试清理只能操作部署时明确设置的测试命名空间，禁止在生产 Redis 使用 `FLUSHALL`、`KEYS *` 或删除全部 `interview-studio:*`。

本手册、公开政策页面和现有技术措施不构成法律意见。未完成真实运营信息填写及属地/专业确认前，不得宣称产品已经正式合规上线。
