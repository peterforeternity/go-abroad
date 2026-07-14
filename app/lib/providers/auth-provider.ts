import { getRuntimeConfig, requireConfigKeys } from "../env";
import type { AuthProvider } from "./types";
import { ProviderNotConfiguredError } from "./types";

class UnavailableAuthProvider implements AuthProvider {
  async getUser(): Promise<null> {
    throw new ProviderNotConfiguredError(
      "AUTH_PROVIDER_NOT_CONFIGURED",
      "认证服务尚未配置，暂不能进行用户登录",
    );
  }

  async requireUser(): Promise<never> {
    throw new ProviderNotConfiguredError(
      "AUTH_PROVIDER_NOT_CONFIGURED",
      "认证服务尚未配置，暂不能进行用户登录",
    );
  }
}

export function getAuthProvider(): AuthProvider {
  const config = getRuntimeConfig();
  try {
    requireConfigKeys(
      config,
      ["authIssuerUrl", "authClientId", "authClientSecret", "sessionSecret"],
      "认证服务配置不完整",
    );
  } catch {
    return new UnavailableAuthProvider();
  }

  // The real OIDC adapter is intentionally not invented without a selected provider.
  return new UnavailableAuthProvider();
}
