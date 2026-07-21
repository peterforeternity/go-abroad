import { jsonSuccess, withApiHandler } from "../../../lib/api";
import { readJsonObject, verifyEmailToken } from "../../../lib/auth/service";
import { enforceRateLimit } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    await enforceRateLimit(request, "auth-verify", { limit: 10, windowSeconds: 900 });
    const body = await readJsonObject(request);
    await verifyEmailToken(body.token);
    return jsonSuccess({ message: "邮箱验证成功，现在可以登录" }, requestId);
  });
}
