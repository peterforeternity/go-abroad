import { ApiError, jsonSuccess, withApiHandler } from "../../../lib/api";
import { login, readJsonObject, validateEmail } from "../../../lib/auth/service";
import { enforceRateLimit, rateLimitHeaders } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    const rateLimit = await enforceRateLimit(request, "auth-login", { limit: 10, windowSeconds: 900 });
    const body = await readJsonObject(request);
    if (typeof body.password !== "string" || body.password.length > 128) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "邮箱或密码不正确");
    }
    const result = await login({ email: validateEmail(body.email), password: body.password });
    return jsonSuccess(result.user, requestId, {
      headers: { ...rateLimitHeaders(rateLimit), "Set-Cookie": result.cookie },
    });
  });
}
