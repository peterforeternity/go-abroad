# Cloudflare staging runbook

本 runbook 只针对独立 staging，禁止复用或修改现有 production Sites/D1/KV/Worker。当前执行因 Wrangler 未授权而停止在登录前；没有创建云端资源、写入 Secret、应用远程 migration 或部署。

## 0. 安全前置条件

- 当前 production Sites 配置仍由 `.openai/hosting.json` 管理；不要把 staging 的 D1/KV ID 写入该文件。
- 将 `wrangler.staging.example.jsonc` 复制为本地未提交的 `wrangler.staging.jsonc`，只替换 staging 资源 ID 和非密钥变量。
- 不要在 `vars`、Git、日志或聊天中写 Secret。`.env*`、`.dev.vars*` 和 `wrangler.staging.jsonc` 已/应保持忽略；Secret 只通过 Cloudflare Secret 配置。
- `workers_dev` 保持 `false`，先配置 Cloudflare Access 或等价的 custom 私有访问入口；没有私有访问策略时不要部署可访问的 staging 地址。

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

登录后必须人工确认目标账户、D1/KV 资源归属和 production 资源不相同，再继续。任何未知同名资源不得覆盖。

## 2. 创建独立资源

```sh
npx wrangler d1 create study-abroad-staging-db
npx wrangler kv namespace create study-abroad-staging-kv
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
ALLOW_DEMO_DATA=false
DATA_PROVIDER_MODE=http
CACHE_PROVIDER=kv
KV_NAMESPACE_BINDING=KV
RATE_LIMIT_PROVIDER=external
NEXT_PUBLIC_SITE_URL=https://<private-staging-host>
ALLOWED_ORIGINS=https://<private-staging-host>
DATA_PROVIDER_BASE_URL=<real-provider-base-url>
AUTH_ISSUER_URL=<oidc-issuer-url>
AUTH_CLIENT_ID=<oidc-client-id>
MAIL_FROM=<verified-sender>
```

如果数据、认证或邮件供应商尚未配置，保留空值会使对应接口安全失败；不得把 `ALLOW_DEMO_DATA` 改回 `true`。

## 4. 配置 Secret

只有用户已在选定供应商控制台创建并通过安全渠道准备好值后，才逐项执行：

```sh
for key in \
  AUTH_CLIENT_SECRET \
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

命令会交互式读取值；不要把值放入命令历史、脚本、日志或聊天。配置后只检查名称/存在性，不回显值。当前代码还接受 `MONITORING_AUTH_TOKEN` 作为通用监控 Token，但 staging 约定使用 `SENTRY_AUTH_TOKEN`。

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
npx wrangler d1 migrations apply study-abroad-staging-db --remote \
  --config wrangler.staging.jsonc
npx wrangler d1 migrations list study-abroad-staging-db --remote \
  --config wrangler.staging.jsonc
```

只查询元数据和约束，不输出用户数据：

```sh
npx wrangler d1 execute study-abroad-staging-db --remote \
  --command "SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name;" \
  --config wrangler.staging.jsonc
npx wrangler d1 execute study-abroad-staging-db --remote \
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

## 7. KV 与 Cron 验证

仅使用无敏感内容的临时 smoke key，并设置短 TTL：

```sh
npx wrangler kv key put --namespace-id <STAGING_KV_NAMESPACE_ID> \
  _staging_smoke "ok" --expiration=60 --remote
npx wrangler kv key get --namespace-id <STAGING_KV_NAMESPACE_ID> \
  _staging_smoke --remote
npx wrangler kv key delete --namespace-id <STAGING_KV_NAMESPACE_ID> \
  _staging_smoke --remote
```

确认 Worker 配置包含 `KV`、Cron `*/5 * * * *` 和 `scheduled()` handler。Cron 使用 UTC；通过 Worker 日志确认触发结果。没有真实数据供应商时，scheduled 同步应安全失败，不得写入 demo 作为真实同步结果。

## 8. D1 最小读写 smoke test

只在空的 staging 数据库执行，使用临时表并在同一条维护操作后删除：

```sh
npx wrangler d1 execute study-abroad-staging-db --remote \
  --command "CREATE TABLE IF NOT EXISTS _staging_smoke (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO _staging_smoke (id, value) VALUES (1, 'ok'); SELECT value FROM _staging_smoke WHERE id = 1; DROP TABLE _staging_smoke;" \
  --config wrangler.staging.jsonc
```

若 staging 已有业务数据，不执行该命令，改用受审查的测试表/事务方案。

## 9. 回滚

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

## 10. 当前阻塞

本次执行的 `npx wrangler whoami` 返回未授权，因此以上云端命令均未执行。用户完成 `npx wrangler login` 并确认目标 Cloudflare 账户后，必须从第 1 节开始，先做资源清单和 production 隔离核对，再进入创建步骤。
