import { jsonSuccess, withApiHandler } from "../../../lib/api";
import { readJsonObject, requestPasswordReset, validateEmail } from "../../../lib/auth/service";
import { enforceRateLimit, rateLimitHeaders } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    const rateLimit = await enforceRateLimit(request, "auth-password-reset-request", { limit: 5, windowSeconds: 900 });
    const body = await readJsonObject(request);
    await requestPasswordReset(validateEmail(body.email));
    return jsonSuccess(
      { message: "如果该邮箱已注册，我们会发送密码重置邮件" },
      requestId,
      { status: 202, headers: rateLimitHeaders(rateLimit) },
    );
  });
}
