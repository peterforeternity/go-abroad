import { jsonSuccess, withApiHandler } from "../../../lib/api";
import { logout } from "../../../lib/auth/service";
import { enforceRateLimit } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    await enforceRateLimit(request, "auth-logout", { limit: 30, windowSeconds: 60 });
    const cookie = await logout(request);
    return jsonSuccess({ message: "已安全退出" }, requestId, { headers: { "Set-Cookie": cookie } });
  });
}
