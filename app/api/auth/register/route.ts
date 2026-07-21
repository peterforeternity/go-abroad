import { jsonSuccess, withApiHandler } from "../../../lib/api";
import { readJsonObject, register, validateDisplayName, validateEmail, validatePassword } from "../../../lib/auth/service";
import { enforceRateLimit, rateLimitHeaders } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    const rateLimit = await enforceRateLimit(request, "auth-register", { limit: 5, windowSeconds: 900 });
    const body = await readJsonObject(request);
    await register({
      email: validateEmail(body.email),
      password: validatePassword(body.password),
      displayName: validateDisplayName(body.displayName),
    });
    return jsonSuccess(
      { message: "账户已创建，请查收验证邮件" },
      requestId,
      { status: 201, headers: rateLimitHeaders(rateLimit) },
    );
  });
}
