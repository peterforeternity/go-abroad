import { getRuntimeConfig, requireConfigKeys } from "../env";
import type { EmailProvider } from "./types";
import { ProviderNotConfiguredError } from "./types";

class UnavailableEmailProvider implements EmailProvider {
  async sendVerificationEmail(): Promise<void> {
    throw new ProviderNotConfiguredError(
      "EMAIL_PROVIDER_NOT_CONFIGURED",
      "邮件服务尚未配置，无法发送验证邮件",
    );
  }

  async sendPasswordResetEmail(): Promise<void> {
    throw new ProviderNotConfiguredError(
      "EMAIL_PROVIDER_NOT_CONFIGURED",
      "邮件服务尚未配置，无法发送重置邮件",
    );
  }
}

export function getEmailProvider(): EmailProvider {
  const config = getRuntimeConfig();
  try {
    requireConfigKeys(config, ["emailProviderApiKey"], "邮件服务配置不完整");
  } catch {
    return new UnavailableEmailProvider();
  }

  // Provider-specific delivery is intentionally not invented without a vendor contract.
  return new UnavailableEmailProvider();
}
