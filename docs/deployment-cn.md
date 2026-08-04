# Interview Studio 中国境内部署手册

## 1. 推荐架构

封闭 Beta 采用单机架构：境内云服务器运行 Docker，Nginx 负责 HTTPS 与反向代理，Next.js standalone 容器同时承载页面和 API，Redis 只在 Compose 内部网络保存邀请码哈希和会话哈希。

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

编辑 `.env.production`，替换两处 `replace_on_server`，并保持 `REDIS_URL=redis://redis:6379`。`BETA_SESSION_DAYS` 用于设置封闭测试会话有效天数。不得将真实密钥提交到 Git、写进镜像或发送到前端。

## 4. 首次发布

```bash
docker compose -f compose.production.yml build
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
curl --fail http://127.0.0.1:3000/api/health
```

健康接口应返回 `status: ok`。它只检查应用进程，不会主动调用第三方 AI 服务，因此不会产生模型费用，也不会泄露服务配置。

Redis 服务没有配置 `ports`，不能从宿主机或公网直接访问；数据通过 `redis_data` 卷持久化。应用在 Redis 不可用时默认拒绝页面访问和业务 API 请求，`/api/health` 仍保持公开。

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

配置文件初始限制为每个 IP 每分钟 30 次 API 请求、突发 20 次，上传体积上限 6 MB，AI 接口超时 180 秒。正式发布前应根据真实流量与模型费用调整，并配置 HTTPS 证书；不要长期只提供 HTTP。

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
- Redis 容器没有宿主机端口映射，Redis 中不存在邀请码或会话令牌明文。

## 8. 更新与回滚

每次发布前记录当前 Git 提交号并保留上一个镜像标签。完成类型检查、测试与生产构建后再部署：

```bash
npm run typecheck
npm test
npm run build
docker compose -f compose.production.yml up -d --build
```

更新后立即执行健康检查和核心流程冒烟测试。若失败，切回上一个已验证提交或镜像，再重新启动服务；不要在生产容器内直接修改代码。

## 9. 公测前仍需完成

- 增加应用层限流与费用配额，避免仅依赖 Nginx IP 限流。
- 为所有接收用户材料的接口增加日志脱敏、请求追踪和错误监控。
- 制定用户内容删除、密钥轮换、数据备份和安全事件响应流程。
- 若开启账号或跨设备同步，将文件会话存储迁移到数据库与对象存储。
- 对隐私政策、AI 生成内容标识、备案和数据处理安排进行正式合规审查。
