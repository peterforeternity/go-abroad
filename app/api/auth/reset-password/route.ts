import { jsonSuccess, withApiHandler } from "../../../lib/api";
import { completePasswordReset, readJsonObject, validatePassword } from "../../../lib/auth/service";
import { enforceRateLimit } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    await enforceRateLimit(request, "auth-password-reset", { limit: 10, windowSeconds: 900 });
    const body = await readJsonObject(request);
    await completePasswordReset(body.token, validatePassword(body.password));
    return jsonSuccess({ message: "密码已更新，请使用新密码登录" }, requestId);
  });
}
