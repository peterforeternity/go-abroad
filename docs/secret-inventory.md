# 外部密钥、凭证与配置清单

本文件只记录用途和管理位置，不包含任何真实值。当前仓库没有创建或伪造密钥。

## 应用配置与密钥

| 变量 | 类型 | 用途 | 创建/获取位置 | Cloudflare 配置位置 |
| --- | --- | --- | --- | --- |
| `APP_ENV` | 配置 | `development`、`staging`、`production` 环境分层 | 发布流程确定 | Worker/Sites 对应环境的 Variables |
| `NEXT_PUBLIC_SITE_URL` | 非密钥配置 | 规范站点地址、回调和安全校验 | staging/正式域名确定后填写 | Variables；只放公开 URL |
| `ALLOWED_ORIGINS` | 非密钥配置 | 严格 CORS 白名单，逗号分隔 origin | 由站点域名和受信前端域名确定 | Variables |
| `DATA_PROVIDER_BASE_URL` | 非密钥配置 | 真实留学数据供应商 API 地址 | 供应商控制台/合同 | Variables |
| `DATA_PROVIDER_API_KEY` | 密钥 | 访问真实留学数据供应商 | 供应商控制台创建 | Worker Settings → Variables and Secrets → Secret |
| `AUTH_ISSUER_URL` | 配置 | OIDC/Auth 服务 issuer | 选定 Auth0、WorkOS、Clerk 等供应商后获取 | Variables |
| `AUTH_CLIENT_ID` | 配置 | OIDC 客户端标识 | 认证供应商控制台 | Variables |
| `AUTH_CLIENT_SECRET` | 密钥 | OIDC 客户端认证 | 认证供应商控制台生成 | Secret |
| `SESSION_SECRET` | 密钥 | 服务端会话签名/加密 | 由用户本地密码管理器或 CSPRNG 生成 | Secret；禁止粘贴到聊天或 Git |
| `EMAIL_PROVIDER_API_KEY` | 密钥 | 邮箱验证和密码重置邮件 | Resend、Postmark 等选定供应商控制台 | Secret |
| `MAIL_FROM` | 配置 | 验证邮件发件人 | 邮箱供应商验证后的域名地址 | Variables |
| `MAIL_REPLY_TO` | 配置 | 邮件回复地址 | 业务邮箱确定 | Variables |
| `TURNSTILE_SITE_KEY` | 配置 | 浏览器端 Bot Protection 标识 | Cloudflare Turnstile 控制台 | Variables；可公开 |
| `TURNSTILE_SECRET_KEY` | 密钥 | 服务端校验 Turnstile | Cloudflare Turnstile 控制台 | Secret |
| `MONITORING_DSN` | 配置/敏感配置 | Sentry 等监控事件入口 | 选定监控平台项目设置 | Variables；按平台建议保护 |
| `SENTRY_AUTH_TOKEN` | 密钥 | Sentry 发布标记、告警或管理 API | Sentry 项目/组织 API Token 页面 | Secret |
| `MONITORING_AUTH_TOKEN` | 兼容密钥名 | 非 Sentry 监控适配器的通用 Token | 选定监控平台 API Token 页面 | Secret |
| `ALERT_WEBHOOK_URL` | 密钥 | 告警接收 Webhook | 选定告警系统生成 | Secret |
| `DATA_SYNC_WEBHOOK_SECRET` | 密钥 | 受保护的人工/外部同步入口 Bearer 校验 | 用户在本地密码管理器生成 | Secret |

## Cloudflare 资源与发布凭证

| 项目 | 创建/获取位置 | 应配置位置 | 注意事项 |
| --- | --- | --- | --- |
| D1 staging 数据库 | Cloudflare Dashboard → Workers & Pages → D1 | 绑定名必须为 `DB`；在 staging 环境配置真实 database ID | 先备份、再执行迁移；当前代码中的 UUID 是本地占位符 |
| KV namespace | Cloudflare Dashboard → Workers & Pages → KV | 绑定名建议为 `KV`；`CACHE_PROVIDER=kv` | 同一 namespace 可供缓存/限流，但生产建议评估 Durable Object/Rate Limiting 产品的原子性需求 |
| Cron Trigger | Worker/Sites 项目设置或 Wrangler 配置 | 当前源码生成 `*/5 * * * *` | 真实同步仍需要数据供应商密钥；缺少密钥时安全失败 |
| Cloudflare API Token | Cloudflare Dashboard → My Profile → API Tokens | 仅放 CI/CD Secret，不放应用 Variables | 最小权限、限定账户/资源；不要使用 Global API Key |
| DNS API Token（如使用自定义域名） | Cloudflare API Tokens | 仅放域名发布流水线 Secret | 只授予目标 zone 的 DNS 编辑权限 |
| 托管控制面临时凭证 | 由当前 Sites/控制面生成 | 不应进入仓库、Worker、日志或前端 | 公有化前撤销/轮换此前产生的临时访问绕过凭证和源仓库凭证 |

## 管理规范

- 本地使用 `.env.local` 或 `.dev.vars`，只从 `.env.example` 复制键名；这些文件已被 Git 忽略。
- staging 和 production 使用 Cloudflare Secret，不通过源码、`wrangler.json`、日志或前端 `NEXT_PUBLIC_*` 变量传递密钥。
- 每个环境使用独立凭证、独立 D1/KV 资源和独立回调 URL；禁止 staging 复用 production 密钥。
- 密钥轮换后先在 staging 验证，再撤销旧值；泄露时立即撤销，不等待代码发布。
- API 日志只允许记录 request ID、路由、状态和耗时；密码、Token、Cookie、Authorization 和完整 API Key 必须脱敏。
