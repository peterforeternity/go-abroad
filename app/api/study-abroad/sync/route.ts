import { jsonSuccess, withApiHandler } from "../../../lib/api";
import { ApiError } from "../../../lib/api";
import { getRuntimeConfig } from "../../../lib/env";
import { runStudyDataSync } from "../../../lib/providers/study-data-provider";
import { enforceRateLimit, rateLimitHeaders } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    const config = getRuntimeConfig();
    const expected = config.dataSyncWebhookSecret;
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!expected || provided !== expected) {
      throw new ApiError(
        expected ? 403 : 503,
        expected ? "SYNC_AUTH_REQUIRED" : "SYNC_AUTH_NOT_CONFIGURED",
        expected ? "同步入口需要服务端授权" : "同步入口尚未配置服务端授权",
      );
    }

    const rateLimit = await enforceRateLimit(request, "study-data-sync", {
      limit: 5,
      windowSeconds: 60,
    });
    const result = await runStudyDataSync();
    return jsonSuccess(result, requestId, {
      headers: rateLimitHeaders(rateLimit),
    });
  });
}
