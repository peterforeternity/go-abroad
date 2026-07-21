# D1 + Resend 原生认证

## 当前实现

- `POST /api/auth/register`：创建或更新尚未验证的账户并发送 24 小时有效的验证链接。
- `POST /api/auth/verify-email`：消费一次性验证令牌。
- `POST /api/auth/login`：验证密码和邮箱状态，创建 D1 会话并设置 HttpOnly Cookie。
- `GET /api/auth/me`：从服务端会话读取当前用户。
- `POST /api/auth/logout`：撤销当前会话并清除 Cookie。
- `POST /api/auth/forgot-password`：使用防枚举响应发送 1 小时有效的重置链接。
- `POST /api/auth/reset-password`：更新密码、消费令牌并撤销该用户全部旧会话。

密码使用带 16 字节随机盐的 PBKDF2-SHA256（210,000 次迭代）。会话、验证和重置令牌使用 32 字节随机值；D1 只保存以 `SESSION_SECRET` 计算的 HMAC-SHA256，不保存可用明文令牌。staging/production Cookie 使用 `__Host-` 前缀、`Secure`、`HttpOnly`、`SameSite=Strict` 和根路径。

## Resend staging 配置

1. 在 Resend Domains 中添加自有发件子域，例如 `mail.staging.example.com`，按控制台要求配置 SPF 和 DKIM，建议增加 DMARC。
2. 域名验证成功后，在 Resend API Keys 创建仅有 **Sending access**、且限制到该域名的 staging key。
3. 在 Cloudflare Worker `study-abroad-staging` 中设置普通变量 `MAIL_FROM`（例如 `启程 <auth@已验证子域>`），可选设置 `MAIL_REPLY_TO`。
4. 通过 `npx wrangler secret put SESSION_SECRET --config wrangler.staging.jsonc` 和 `npx wrangler secret put EMAIL_PROVIDER_API_KEY --config wrangler.staging.jsonc` 交互配置两个 Secret。值不得写入 Git、命令参数、日志或聊天。
5. 设置 `NEXT_PUBLIC_SITE_URL` 和 `ALLOWED_ORIGINS` 为受 Cloudflare Access 保护的 staging origin。

Resend 官方要求 API Key 保密，并支持将 Sending access key 限制到指定域名；发送 API 使用 `POST /emails`，本实现同时使用 24 小时有效的幂等键防止重复发送。

## 尚未包含

- Turnstile 挑战仍未接入，公开认证入口前必须补充 Bot 防护。
- 当前 KV 限流不是强一致计数器；公开高并发前应评估 Cloudflare Rate Limiting 或 Durable Objects。
- 没有社交登录、MFA、管理员后台或账号删除流程。
- 留学数据供应商仍未配置，和认证上线互不冒充完成状态。
