# Staging 部署下一步

本阶段只准备 staging，不执行 public 访问策略切换、正式域名绑定或 production 部署。

## 前置条件

1. 用户确认一个独立的 Cloudflare staging 项目/环境，并提供 D1 database、KV namespace 和 Worker/Sites 配置权限。
2. 用户选定认证、邮件、留学数据供应商和监控平台；按 `docs/secret-inventory.md` 创建对应配置。
3. 用户提供 staging 站点 URL、允许的前端 origin、回调 URL、发件域名和隐私/服务条款地址。
4. 在 Cloudflare 中把真实 D1 绑定名配置为 `DB`；如使用 KV，绑定名配置为 `KV`。

## 建议执行顺序

```sh
cp .env.example .env.local
# 仅在本机填写 development 值；不要把 .env.local 提交到 Git
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:unit
```

在 staging 环境配置 `APP_ENV=staging`、`ALLOW_DEMO_DATA=false`、真实数据供应商和非内存限流/缓存后，先调用：

```text
GET /api/health
GET /api/study-abroad
```

应确认 health 返回可用状态、数据响应的 `source` 不为 `demo`、`isDemo=false`，并检查 `X-Request-ID`、`ETag`、安全响应头和 CORS 白名单。

Cron 配置为每 5 分钟执行一次；Cloudflare Cron 使用 UTC，需在验收记录中把 UTC 触发时间换算为业务时区并确认 `scheduled()` 日志。触发器变更可能需要数分钟传播，不能以刚保存配置后的瞬时状态判断失败。

## 数据库迁移

先在 staging 备份并执行 `docs/database-migrations.md` 中的 `0000`、`0001` 顺序迁移，再执行认证/收藏业务验收。任何迁移失败都停止发布，按向前修复或备份恢复流程处理。

## 验收门槛

- 认证供应商、邮箱验证、密码重置和服务端权限判断已经是真实实现。
- 数据供应商连续同步至少 24 小时无异常；延迟不超过 5 分钟。
- KV/限流策略在多实例下验证；监控、告警、日志脱敏和备份恢复演练完成。
- 通过负载测试验证页面加载、API P95 和至少 1000 并发目标。
- 业务方确认数据来源、政策免责声明、隐私政策和服务条款。

只有以上门槛全部通过并得到明确授权，才进入独立的 public/production 发布变更。
