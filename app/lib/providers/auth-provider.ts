import { ApiError } from "../api";
import { getSessionUser } from "../auth/service";
import type { AuthProvider, AuthUser } from "./types";

class D1AuthProvider implements AuthProvider {
  getUser(request: Request): Promise<AuthUser | null> {
    return getSessionUser(request);
  }

  async requireUser(request: Request): Promise<AuthUser> {
    const user = await this.getUser(request);
    if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "请先登录后再继续");
    return user;
  }
}

const provider = new D1AuthProvider();

export function getAuthProvider(): AuthProvider {
  return provider;
}
