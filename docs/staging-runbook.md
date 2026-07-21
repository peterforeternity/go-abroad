# Cloudflare staging runbook

本 runbook 只针对独立 staging，禁止复用或修改现有 production Sites/D1/KV/Worker。当前 staging 已创建独立 D1/KV，两个 migration 已应用，Worker 版本已上传并保持 100% 活跃，云端 schedules API 已确认唯一 Cron 为 `*/5 * * * *`；在 Access 保护状态确认前不发起 HTTP 验证。

## 0. 安全前置条件

- 当前 production Sites 配置仍由 `.openai/hosting.json` 管理；不要把 staging 的 D1/KV ID 写入该文件。
- `wrangler.staging.jsonc` 是不含 Secret、可提交的 staging 部署配置；只保留 staging 资源 ID 和非密钥变量。
- 不要在 `vars`、Git、日志或聊天中写 Secret。`.env*`、`.dev.vars*`、日志和数据库导出保持忽略；Secret 只通过 Cloudflare Secret 配置。
- staging 配置使用 `workers_dev:true` 以承载 Cloudflare Access 保护的 workers.dev 入口，`preview_urls:false` 必须保持；Access 策略未确认前不要测试或宣称入口安全。
- 账户级 workers.dev 子域已存在，但入口是否已被 Access 保护必须在 Cloudflare 控制台确认；不要把 `workers_dev:true` 当作访问控制。

## 1. 登录与只读确认

在项目目录执行，日志写入项目的被忽略目录：

```sh
export WRANGLER_LOG_PATH="$PWD/.wrangler/logs/staging-wrangler.log"
npx wrangler login
npx wrangler whoami
npx wrangler d1 list
npx wrangler kv namespace list
npx wrangler pages project list
```

登录后必须人工确认目标账户、D1/KV 资源归属和 production 资源不相同，再继续。任何未知同名资源不得覆盖。本次核查结果：D1、KV、Pages 列表均为空，`study-abroad-staging` Worker 不存在，随后已创建的 staging 资源与 production 隔离。

## 2. 创建独立资源

```sh
npx wrangler d1 create study-abroad-staging-db
npx wrangler kv namespace create study-abroad-staging-kv --binding KV --config wrangler.staging.jsonc
```

把命令返回的 staging ID 仅写入本机 `wrangler.staging.jsonc`：

- D1 binding：`DB`
- KV binding：`KV`
- D1 database：`study-abroad-staging-db`
- KV namespace：`study-abroad-staging-kv`

创建前后都要保存资源名称和 ID 的内部变更记录，但不要把 Secret 值写入记录。

## 3. 配置 staging 普通变量

在 `wrangler.staging.jsonc` 的 `vars` 或 Cloudflare staging 环境 Variables 中配置：

```env
APP_ENV=staging
NEXT_PUBLIC_SITE_URL=https://study-abroad-staging.qicheng-study.workers.dev
ALLOWED_ORIGINS=https://study-abroad-staging.qicheng-study.workers.dev
ALLOW_DEMO_DATA=false
DATA_PROVIDER_MODE=public-apis
CACHE_PROVIDER=kv
KV_NAMESPACE_BINDING=KV
RATE_LIMIT_PROVIDER=kv
AUTH_PROVIDER_MODE=d1
EMAIL_PROVIDER_MODE=resend
MAIL_FROM=启程 <onboarding@resend.dev>
MAIL_REPLY_TO=peterforeternal@qq.com
SESSION_TTL_SECONDS=1209600
CACHE_TTL_SECONDS=300
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
```

Provider 枚举必须与运行时保持一致，不能使用别名或依赖默认分支：

- `DATA_PROVIDER_MODE`：`demo`（仅 development）、`http`（单一签约 HTTP 数据供应商，需要 URL/API Key）或 `public-apis`（OpenAlex、GOV.UK 与 Federal Register 的公开接口聚合，不需要业务 Secret）。
- `public-apis` 展示来源可追溯的院校开放记录和政府政策文件；OpenAlex 研究统计不是院校排名。课程和奖学金分类仅展示定向采集器从官方页面提取的有限摘要，不宣称为完整目录。
- staging 同时启用定向官方页面采集器：Cron 每 5 分钟检查一次，实际页面采集最多每 6 小时一次，结果写入独立 KV 缓存。采集器使用固定域名白名单并遵守 robots.txt；详情见 `docs/crawler.md`。
- `CACHE_PROVIDER`：`memory`（仅 development）、`cache-api` 或 `kv`；当前 staging 固定为 `kv`。
- `RATE_LIMIT_PROVIDER`：`memory`（仅 development）或 `kv`；当前 staging 固定为 `kv`。
- `AUTH_PROVIDER_MODE`：当前唯一允许值为 `d1`，会话和一次性令牌均只以 HMAC 哈希写入 D1。
- `EMAIL_PROVIDER_MODE`：当前唯一允许值为 `resend`，浏览器不会接触邮件 API Key。

非法值会返回 `CONFIGURATION_ERROR`；staging/production 不会回退到 demo、内存缓存或内存限流。

staging 持久化 Workers Logs 保留应用自定义结构化日志，但关闭 Cloudflare invocation logs，避免持久化完整客户端 IP、地理位置、请求头和 TLS 指纹。自定义日志不得记录请求体、Cookie、Authorization、Access JWT 或完整个人信息。

当前 Access 保护的 staging origin 已用于 `NEXT_PUBLIC_SITE_URL` 和 `ALLOWED_ORIGINS`。邮件暂时使用 Resend 测试发件地址 `onboarding@resend.dev`，只能向 Resend 账户邮箱 `peterforeternal@qq.com` 发送，不得用于其他测试用户或公开注册。`public-apis` 模式不需要 `DATA_PROVIDER_BASE_URL` 或 `DATA_PROVIDER_API_KEY`；这两个配置仅在切换到签约 `http` 供应商时启用。不得把 `ALLOW_DEMO_DATA` 改回 `true`。

## 4. 配置 Secret

只有用户已在选定供应商控制台创建并通过安全渠道准备好值后，才逐项执行：

```sh
for key in \
  SESSION_SECRET \
  EMAIL_PROVIDER_API_KEY \
  DATA_PROVIDER_API_KEY \
  DATA_SYNC_WEBHOOK_SECRET \
  TURNSTILE_SECRET_KEY \
  SENTRY_AUTH_TOKEN \
  ALERT_WEBHOOK_URL
do
  npx wrangler secret put "$key" --config wrangler.staging.jsonc
done
```

命令会交互式读取值；不要把值放入命令历史、脚本或聊天。当前正式 staging 配置不包含 `secrets.required` 强制部署项，缺少 Secret 时允许系统以 degraded/safe-fail 模式运行。配置后只检查名称/存在性，不回显值。当前代码还接受 `MONITORING_AUTH_TOKEN` 作为通用监控 Token，但 staging 约定使用 `SENTRY_AUTH_TOKEN`。

## 5. D1 备份、migration 和结构验证

先确认目标数据库是 staging，并建立可恢复的 SQL 导出：

```sh
npx wrangler d1 info study-abroad-staging-db --config wrangler.staging.jsonc
npx wrangler d1 export study-abroad-staging-db --remote \
  --output /private/tmp/study-abroad-staging-before-migrations.sql \
  --config wrangler.staging.jsonc
```

执行顺序 migration：

```sh
npx wrangler d1 migrations apply DB --remote \
  --config wrangler.staging.jsonc
npx wrangler d1 migrations list DB --remote \
  --config wrangler.staging.jsonc
```

只查询元数据和约束，不输出用户数据：

```sh
npx wrangler d1 execute DB --remote \
  --command "SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name;" \
  --config wrangler.staging.jsonc
npx wrangler d1 execute DB --remote \
  --command "PRAGMA foreign_key_check;" \
  --config wrangler.staging.jsonc
```

再次执行 `migrations apply` 应显示没有待执行 migration。不得修改 `drizzle/0000_init.sql` 或已经发布的 migration。

## 6. 构建、部署和验证

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npx wrangler deploy --config wrangler.staging.jsonc
```

当前部署结果：Worker 版本已经上传并处于 100% 活跃状态，Wrangler 已成功写入 Cron `*/5 * * * *`。staging 使用 `workers_dev:true`、`preview_urls:false`，无 route/custom domain；必须先确认 workers.dev 已由 Cloudflare Access 保护，再做 HTTP 验证。

应用 `0002_plain_spot.sql` 并配置 Resend 后，认证私有验收还应覆盖：注册发送验证邮件、未验证账户拒绝登录、验证后登录、`HttpOnly/Secure/SameSite=Strict` 会话 Cookie、退出、重置密码以及重置后旧会话失效。测试邮箱只能使用授权测试人员邮箱，不得批量发送。

部署后在私有 staging 地址执行：

```sh
curl -fsS -D /tmp/staging-health.headers "$STAGING_URL/api/health" -o /tmp/staging-health.json
curl -i "$STAGING_URL/api/study-abroad"
curl -i -X POST "$STAGING_URL/api/study-abroad/sync"
curl -i "$STAGING_URL/api/study-abroad?limit=101"
curl -i -X OPTIONS "$STAGING_URL/api/health" \
  -H 'Origin: https://untrusted.example' \
  -H 'Access-Control-Request-Method: GET'
```

验收要求：

- `/api/health` 返回基础运行状态；外部供应商缺失时允许 `status=degraded`，但不能把 demo 标成真实数据。
- staging `study-abroad` 不得返回 `source=demo` 作为实时权威数据；缺少真实供应商时应明确 503/配置错误。
- 检查 `Content-Security-Policy`、HSTS、X-Content-Type-Options、Referrer-Policy、Permissions-Policy 和 `X-Request-ID`。
- CORS 非法来源必须拒绝；同步入口无授权必须拒绝。
- 日志只允许出现 request ID、路径、状态、耗时和错误代码，不得出现 Secret。

## 7. Cloudflare Access（必须由用户在控制台确认）

当前不执行任何网络入口修改。用户确认后，在 Cloudflare 控制台按以下顺序配置：

1. 进入 **Workers & Pages → study-abroad-staging → Settings → Domains & Routes**。
2. 仅使用 **Enable Cloudflare Access** 的受保护流程；不要单独启用无保护的 `workers.dev`。Cloudflare 官方支持直接按 Worker 名称创建 Access 应用，也支持在 Worker 的 `workers.dev` 入口上启用 Access。[Cloudflare Access Worker 保护说明](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/choose-application-type/)
3. 进入 **Zero Trust → Access controls → Applications**，确认应用目标是 `study-abroad-staging` Worker，而不是 Bookmark。
4. 创建明确的 Allow policy：只允许指定测试邮箱或测试组，启用 MFA；不要添加 `Everyone` 或匿名 Allow。Access 应用默认拒绝未匹配用户。[Access 应用配置说明](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/self-hosted-private-app/)
5. 确认 `workers.dev` 入口显示为 Cloudflare Access 保护状态，并确认未添加 route、custom domain 或 production 域名。
6. 用户完成控制台复核后再确认；Cron 已独立配置完成，之后使用带 Access 的 URL 做 API 验证即可。`workers_dev:true` 只代表启用 workers.dev 入口，不代表它已受保护；Access 未确认前不得进行 HTTP 测试。[workers.dev 配置说明](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

## 8. KV 与 Cron 验证

仅使用无敏感内容的临时 smoke key，并设置短 TTL：

```sh
npx wrangler kv key put --namespace-id <STAGING_KV_NAMESPACE_ID> \
  staging_smoke_test "ok" --ttl=60 --remote
npx wrangler kv key get --namespace-id <STAGING_KV_NAMESPACE_ID> \
  staging_smoke_test --text --remote
npx wrangler kv key delete --namespace-id <STAGING_KV_NAMESPACE_ID> \
  staging_smoke_test --remote
```

本次 staging KV smoke test 已完成写入、读取和删除，删除后再次读取返回 404。云端 schedules API 已返回且仅返回 Cron `*/5 * * * *`；版本详情确认包含 `KV`、Cron 配置和 `scheduled()` handler。Cron 使用 UTC。Wrangler local `--test-scheduled` 已返回 `Ran scheduled event`，并记录结构化 `study_data_sync_failed`/`ConfigurationError`；没有真实数据供应商时，scheduled 同步应安全失败，不得写入 demo 作为真实同步结果。

## 9. D1 最小读写 smoke test

只在空的 staging 数据库执行，使用临时表并在同一条维护操作后删除：

```sh
npx wrangler d1 execute DB --remote \
  --command "CREATE TABLE IF NOT EXISTS _staging_smoke (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO _staging_smoke (id, value) VALUES (1, 'ok'); SELECT value FROM _staging_smoke WHERE id = 1; DROP TABLE _staging_smoke;" \
  --config wrangler.staging.jsonc
```

若 staging 已有业务数据，不执行该命令，改用受审查的测试表/事务方案。

## 10. 回滚

### Worker

先列出 staging 版本并记录当前成功版本 ID：

```sh
npx wrangler deployments list --name study-abroad-staging --config wrangler.staging.jsonc
npx wrangler rollback <PREVIOUS_WORKER_VERSION_ID> --name study-abroad-staging --yes --config wrangler.staging.jsonc
```

回滚后重新检查 `/api/health` 和安全响应头。只允许回滚 staging Worker，不要使用 production 版本 ID。

### D1

本项目不执行 down migration。失败时先停止 staging 写入并保留错误日志；若结构/数据需要恢复，使用执行前的 staging SQL 导出或 Cloudflare 恢复点，在 staging 验证后再恢复。不要将任何 rollback 命令指向 production D1。

### KV、Secret、Cron 和访问

- 删除 staging smoke key；不要清空整个 namespace。
- 立即撤销泄露 Secret，并重新执行 `wrangler secret put`。
- 通过 staging Worker Settings/配置移除 Cron，确认传播完成。
- 关闭 staging Access policy 或暂停 Worker 路由；不要把访问模式改为 public。

## 11. 当前状态

Cron、D1、KV 和 scheduled handler 的配置/安全行为验证已完成。当前唯一未完成项是私有 HTTP 验证：由用户完成第 7 节 Cloudflare Access 控制台步骤并确认保护状态后，再使用受保护 URL 验证 API；在此之前不发起 HTTP 请求，也不把 workers.dev 视为已受保护。
