# 公有化部署前第一阶段生产化审计

审计日期：2026-07-14（Asia/Shanghai）  
审计分支：`feat/production-readiness`  
审计范围：当前工作区源码、数据库结构、构建配置、测试、生成的 Wrangler 配置，以及已存在的 Sites 项目配置。  
审计方式：以当前文件和实际命令结果为准，不以历史描述或预期配置替代现场证据。

本文前半部分保留第一阶段改造前的基线快照；当前分支和 staging 现场结论以“改造后复核”和“第二阶段 staging 现场结果”为准。

## 结论摘要

当前项目**不具备直接公开访问条件**。它已经是一个可构建的 React/vinext + Cloudflare Worker 站点原型，但认证、真实数据同步、持久化写入、统一 API 基础设施和安全策略仍未完成。

当前最重要的风险不是前端页面，而是以下三项：

1. 登录、注册、邮箱验证、密码重置全部仍是客户端演示流程，没有真实认证 API、会话和邮件发送。
2. 留学数据由本地常量提供，所谓“5 分钟更新”由 Worker 进程内存缓存和动态时间字段构成，不代表真实数据同步。
3. D1 只有 schema 和初始 migration，当前代码没有用户、收藏或认证令牌的读写接口，也没有完成外键、查询索引和生产迁移验证。

## 当前技术栈与运行入口

| 范畴 | 现场结论 |
| --- | --- |
| 前端 | React 19.2.6，Next 16.2.6 兼容层，vinext 0.0.50，Vite 8.0.13；主要 UI 位于 `app/page.tsx` 和 `app/globals.css`。 |
| 服务端 | Cloudflare Worker ESM，入口为 `worker/index.ts`，交给 vinext App Router 处理。 |
| API | 当前只有 `GET /api/study-abroad`。 |
| 数据库 | Drizzle ORM + SQLite schema，逻辑绑定为 D1 `DB`。 |
| 对象存储 | `.openai/hosting.json` 中 `r2` 为 `null`，代码未使用 R2。 |
| 缓存 | `app/lib/study-abroad-data.ts` 中使用模块级内存缓存，TTL 为 300 秒；未配置 KV 或 Cache API 抽象。 |
| 定时任务 | 未发现 Cron Trigger、Queues、Workflows 或 Worker `scheduled` 入口。 |
| 认证 | 存在 `app/chatgpt-auth.ts` 的 ChatGPT/SIWC 辅助函数，但主页未使用；公开邮箱认证没有后端实现。 |
| 托管配置 | `.openai/hosting.json` 仅包含 Sites `project_id`、D1 `DB` 和 `r2: null`。 |
| Wrangler | 生成配置显示无 KV、无 Cron、无 queues、无 secrets，D1 使用本地占位 database id。 |

## 功能状态分类

### 已完成且可用于生产的部分

- React/vinext 页面可以完成生产构建。
- 静态首页、目的地卡片、搜索筛选和信息详情交互可以运行。
- `GET /api/study-abroad` 能返回 JSON，包含当前静态数据，并设置 ETag 与 HTTP 缓存头。
- 站点元数据和分享卡片已配置。
- D1 schema、Drizzle 配置和一份初始 SQL migration 已进入源码。
- 现有 3 个服务端渲染/API/产品元数据测试通过。

这些结论仅表示“代码可以运行”，不等于认证、数据准确性或公有化安全验收已经完成。

### 仅为演示或模拟的部分

- 登录、注册、密码重置、邮箱验证：`AuthModal` 只在浏览器内校验输入并显示成功提示，没有网络请求或持久化。
- 收藏清单：保存在 React 内存状态中，刷新页面即丢失，没有绑定当前用户。
- 申请雷达和快速评估：均为客户端演示状态。
- 留学数据：由 `STUDY_ABROAD_FALLBACK` 常量提供，没有连接政策、院校、排名或奖学金供应商。
- “数据每 5 分钟自动同步”：当前只是展示文案和内存缓存，不能证明真实上游数据已同步。

### 存在但不完整的部分

- D1 表：已存在 `users`、`saved_items`、`auth_tokens`，并有邮箱唯一约束和用户/项目唯一约束；但没有外键约束，也没有针对 `user_id`、`token_hash`、`purpose`、`expires_at` 的查询索引。
- `db/index.ts`：有 D1/Drizzle 访问辅助函数，但没有被业务路由调用。
- ChatGPT/SIWC 辅助函数：具备安全 return path 和可选用户读取逻辑，但没有被保护页面或 API 调用。
- `/api/study-abroad`：有 ETag、HTTP 缓存头和基础数据返回，但没有统一响应 envelope、request ID、结构化日志、参数校验、CORS、限流或错误降级。
- Worker 图片优化入口：存在，但 Worker 环境类型依赖 `Fetcher`、`D1Database` 等全局类型，当前 TypeScript 校验无法完整通过。

### 尚未实现的部分

- `/api/health` 健康检查。
- 统一 API 响应格式与统一异常处理。
- request ID、结构化日志和敏感字段脱敏。
- CSP、HSTS、X-Content-Type-Options、Referrer-Policy、Permissions-Policy。
- 严格 CORS 白名单。
- 登录、注册、密码重置、搜索接口限流。
- 环境变量 schema 校验和 development/staging/production 分层。
- `AuthProvider`、`EmailProvider`、`StudyDataProvider`、`CacheProvider`、`MonitoringProvider` 抽象。
- 真实上游数据同步、Cron 入口、KV/Cache API 共享缓存。
- D1 业务读写 API、数据库级权限校验和生产 migration 执行记录。
- 真实监控、告警、备份恢复演练和回滚 runbook。

### 必须由用户提供外部信息或授权后才能完成

- 将 Sites 访问策略从当前的单用户 `custom` 改为 `public` 的明确授权。
- 自定义域名及 DNS 管理权限（如需要）。
- 托管身份服务、邮箱服务和留学数据供应商账号。
- 对应的生产 API Key、OIDC Client Secret、邮件服务凭证和告警 Webhook。
- 正式发件域名的 SPF、DKIM、DMARC 配置权限。
- 隐私政策、服务条款、数据保留期限、客服邮箱和适用地区。
- 生产 D1 数据库 ID、staging D1 数据库 ID 及迁移执行授权。

## API、认证和数据路由审计

### 已发现路由

| 路由 | 方法 | 当前状态 |
| --- | --- | --- |
| `/api/study-abroad` | GET | 返回演示数据；支持 ETag 和 HTTP 缓存头；无真实上游请求。 |
| `/signin-with-chatgpt` | 外部 dispatch 路由 | 仅由 UI 生成链接，项目没有实现该路由。 |
| 注册、登录、验证、重置密码 | 未发现 | 当前没有服务端 API。 |
| 健康检查 | 未发现 | 当前没有 `/api/health`。 |

### 前端直连和密钥检查

- 未发现前端直接访问 D1 的代码。
- 未发现把上游 API Key 注入客户端 bundle 的代码。
- 仓库扫描未发现 `sk-*`、私钥块、Bearer 凭证、Cloudflare API Token 或邮件服务密钥。
- `.openai/hosting.json` 中的 `project_id` 是托管标识，不是应用密钥；它不应被误当成凭证。
- 托管控制面可能产生临时源仓库凭证或内部访问绕过凭证；它们不能写入仓库、构建产物、前端或日志，公有化前应撤销或轮换。

## 绑定和部署配置审计

现场 `vite.config.ts` 配置了：

- Worker 主入口：`./worker/index.ts`
- `nodejs_compat`
- D1 逻辑绑定：`DB`
- 本地 D1 占位 database id
- Cloudflare Vite plugin 和 Sites plugin

未配置：

- KV namespace
- Cache API 抽象
- Cron Trigger
- Queues、Workflows、Durable Objects
- 生产 secrets
- staging/production environment 分层
- 自定义域名配置

## 基线验证结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm run lint` | 失败 | `node_modules/.bin/eslint` 不存在，当前依赖安装不完整。 |
| `node node_modules/typescript/bin/tsc --noEmit` | 失败 | 缺少 Next/Cloudflare 类型声明，并发现 `app/chatgpt-auth.ts` 的返回类型问题。 |
| `node --test tests/rendered-html.test.mjs` | 通过 | 3 个测试通过；未覆盖认证、限流、数据库和安全头。 |
| `node node_modules/vinext/dist/cli.js build` | 通过 | vinext 生产构建完成，包含 `/` 和 `/api/study-abroad`。 |
| `npm run build` | 不可作为当前基线验证命令 | 当前依赖缺少 `node_modules/.bin/vinext`，需要先修复依赖安装。 |

## 公开访问结论

**当前不具备公开访问条件。**

在完成真实认证、数据源适配、共享缓存、统一 API 基础能力、安全响应头、限流、环境校验和 staging 验收前，不应把 Sites 访问策略改为 `public`。即使页面本身可以构建，也不能将演示数据或演示认证流程当作正式留学服务上线。

## 第一、二阶段改造后复核（含 staging 云端结果）

上面的分类和基线命令记录的是第一阶段改造开始前的现场快照；以下是本分支已完成的代码改造和第二阶段 staging 现场结果。没有执行 Sites public 化、正式域名绑定或 production 部署，所有远程写入仅指向新建 staging 资源。

### 已直接完成且不依赖外部密钥的改造

- 增加 `.env.example`、development/staging/production 配置解析和校验；`.env.local`、`.dev.vars`、构建状态文件均被忽略。
- 增加统一 `{ ok, data, error, meta }` API envelope、统一异常映射、`X-Request-ID`、结构化 JSON 日志和敏感字段脱敏。
- 增加 `GET /api/health`；作为 liveness 接口始终返回基础运行状态，配置不完整时返回 `200 + status=degraded + ready=false`，不泄露密钥值。
- Worker 入口注入实际绑定，业务代码读取 `DB`/`KV`；没有前端 D1 访问，也没有把上游 API Key 打进客户端。
- Worker 统一增加 CSP、HSTS（非 development HTTPS）、X-Content-Type-Options、Referrer-Policy、Permissions-Policy、X-Frame-Options 和严格 CORS。
- 留学数据接口增加查询参数校验、限流、ETag、缓存命中标记和 `source`、`lastSyncedAt`、`isStale`、`dataVersion`、`isDemo` 字段；demo 明确标记为 `source=demo`、`isDemo=true`、`isStale=true`，不再伪造同步时间。
- 创建 `StudyDataProvider`、`AuthProvider`、`EmailProvider`、`CacheProvider`、`MonitoringProvider` 接口及安全占位实现；开发环境支持内存缓存/限流，生产可接 Cache API/KV，未配置时 503 安全失败。
- HTTP 数据提供商适配只在服务端携带 API Key，具有超时、最多 3 次有限重试、上游错误映射和无效 payload 拒绝；Cron `*/5 * * * *` 入口只在真实数据源可用时写入缓存。
- `POST /api/study-abroad/sync` 需要服务端 Bearer 授权；未配置授权时 503，不能被浏览器匿名触发。
- 新增 `drizzle/0001_adorable_morlun.sql`，不修改 `0000_init.sql`；以保留数据的 SQLite 表重建方式增加用户外键、级联删除、令牌哈希唯一约束及查询索引，并补充迁移/回滚文档。
- 前端已适配统一 API 响应，不再对 `lastSynced=null` 做字符串操作，并明确显示 demo 数据提示。

### 改造后仍然不能视为生产完成的部分

- 认证、注册、邮箱验证、密码重置仍没有真实服务端实现；`AuthProvider` 和 `EmailProvider` 是等待用户选定供应商的占位适配器，主页表单仍明确显示演示状态。
- staging 已支持无需业务密钥的 `public-apis` 聚合模式（OpenAlex、GOV.UK、Federal Register），并保留签约 `http` 供应商适配器。演示数据仍仅限 development；`http` 模式缺少 `DATA_PROVIDER_BASE_URL`/`DATA_PROVIDER_API_KEY` 会安全失败。
- production `.openai/hosting.json` 保持不变；独立的未跟踪 `wrangler.staging.jsonc` 仅包含 staging D1/KV ID，绑定名为 `DB`/`KV`，不保存 Secret。staging 远程 D1 已按顺序应用两个 migration 并完成结构验证。
- 监控适配器在 development 记录结构化控制台事件，非 development 未配置监控时记录告警并继续提供受保护的错误响应；需要真实监控 DSN/Token 才能完成告警闭环。
- 生产限流优先使用 KV 适配；没有 KV 时返回 503。正式 1000 并发验收前还需要压测并评估 Durable Objects/Cloudflare Rate Limiting 的原子性和成本。
- CSP 当前保留 `unsafe-inline` 以兼容现有 vinext 页面；正式上线前应结合构建产物进一步收敛到 nonce/hash 策略。

### 改造后路由清单

| 路由 | 方法 | 当前状态 |
| --- | --- | --- |
| `/api/health` | GET | 统一 envelope；报告配置、D1、数据源和 demo 状态；外部服务缺失时保持可观测并返回 `degraded/ready=false`。 |
| `/api/study-abroad` | GET | 参数校验、限流、内存/边缘缓存抽象、ETag、统一 envelope；development 明确返回 demo 数据。 |
| `/api/study-abroad/sync` | POST | 服务端 Bearer 授权、限流、真实数据源同步；无授权或无供应商时安全失败。 |
| 登录、注册、邮箱验证、密码重置 | 未实现 | 仍需外部 Auth/Email 供应商、回调、会话和业务 API。 |

### 改造后验证范围

当前测试覆盖首页 SSR、API envelope、demo 数据标记、缓存命中、ETag/304、健康检查、参数拒绝、同步授权失败、CORS 拒绝、安全响应头和 staging 配置约束，共 7/7 通过；没有覆盖真实 OIDC/邮件流程、真实上游服务、Access 后 API、负载/并发和灾备恢复。

### 第二阶段 staging 现场结果

- 只读核查确认目标账户的 D1、KV、Pages 清单在创建前无同名资源；`study-abroad-staging` Worker 创建前不存在。
- 已创建独立 `study-abroad-staging-db`（绑定 `DB`）和 `study-abroad-staging-kv`（绑定 `KV`）；三张业务表行数均为 0，未接触 production 数据。
- `0000_init.sql`、`0001_adorable_morlun.sql` 已应用，重复执行返回无待执行 migration；外键检查为空，`token_hash` 唯一约束和必要索引已验证。
- `staging_smoke_test` 已在新 KV 中完成写入、读取、删除，删除后再次读取为 404。
- Worker `study-abroad-staging` 已上传一个 100% 活跃版本；版本详情包含 `fetch`/`scheduled` handler、`DB`/`KV` 绑定。提交的 staging 配置使用 `workers_dev=true` 以承载 Access 保护的 workers.dev 入口，保持 `preview_urls=false`、无 route、无正式域名；Access 保护状态需由控制台确认。
- Cloudflare schedules API 已确认且仅包含 `*/5 * * * *`；Wrangler local `--test-scheduled` 返回 `Ran scheduled event`，并以 `ConfigurationError` 结构化失败，没有写入业务表。不得在 Access 保护前启用 HTTP 入口。

## 第三阶段：D1 + Resend 认证实现

认证供应商路线已经确定为 D1 原生邮箱密码认证与 Resend 事务邮件。代码现已包含注册、邮箱验证、登录、当前会话、退出、忘记密码和重置密码 API；前端演示提交逻辑已替换为真实 API 调用，并移除了未配置的 ChatGPT 登录入口。

- 密码使用带随机盐的 PBKDF2-SHA256（210,000 次迭代），不会记录或保存明文。
- 会话、邮箱验证和密码重置使用随机不透明令牌；D1 仅保存以独立 `SESSION_SECRET` 计算的 HMAC-SHA256。
- staging/production 会话 Cookie 使用 `__Host-`、`Secure`、`HttpOnly`、`SameSite=Strict`。
- `drizzle/0002_plain_spot.sql` 新增 `sessions` 表、唯一哈希索引、用户/过期索引和级联外键；已在独立 staging D1 应用并验证，四张业务表仍为 0 行。
- Resend 适配使用服务端 `POST /emails`、8 秒超时和幂等键；API Key 不进入浏览器、日志或 Git。
- 本地测试已覆盖完整注册、验证、登录、会话、重置和旧会话撤销流程。

在用户创建并安全配置 staging `SESSION_SECRET`、Resend Sending access key、已验证发件域名、`MAIL_FROM` 和 staging URL/origin 前，线上认证接口会安全返回配置错误。这不影响 `/api/health` 的基础可观测性。公开认证前仍需加入 Turnstile，并评估强一致限流。
