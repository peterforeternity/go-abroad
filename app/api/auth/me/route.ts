import { ApiError, jsonSuccess, withApiHandler } from "../../../lib/api";
import { getSessionUser } from "../../../lib/auth/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    const user = await getSessionUser(request);
    if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "当前未登录");
    return jsonSuccess(user, requestId);
  });
}
