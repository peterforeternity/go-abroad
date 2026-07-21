import { getRuntimeConfig, requireConfigKeys } from "../env";
import type { EmailProvider } from "./types";
import { UpstreamProviderError } from "./types";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | null,
  ) {}

  async sendVerificationEmail(input: { email: string; token: string; returnUrl: string }): Promise<void> {
    await this.send({
      to: input.email,
      subject: "验证你的启程账户邮箱",
      html: messageTemplate(
        "验证邮箱",
        "请验证邮箱以启用你的启程账户。此链接将在 24 小时后失效。",
        "验证邮箱",
        input.returnUrl,
      ),
      idempotencyKey: `verify-${await digestId(input.token)}`,
    });
  }

  async sendPasswordResetEmail(input: { email: string; token: string; returnUrl: string }): Promise<void> {
    await this.send({
      to: input.email,
      subject: "重置你的启程账户密码",
      html: messageTemplate(
        "重置密码",
        "有人请求重置你的启程账户密码。若不是你本人操作，请忽略此邮件。此链接将在 1 小时后失效。",
        "重置密码",
        input.returnUrl,
      ),
      idempotencyKey: `reset-${await digestId(input.token)}`,
    });
  }

  private async send(input: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }): Promise<void> {
    let response: Response;
    try {
      response = await fetch(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      throw new UpstreamProviderError(
        "EMAIL_DELIVERY_FAILED",
        error instanceof Error ? error.name : "Resend request failed",
      );
    }
    if (!response.ok) {
      throw new UpstreamProviderError("EMAIL_DELIVERY_FAILED", `Resend returned HTTP ${response.status}`);
    }
  }
}

function messageTemplate(title: string, description: string, action: string, returnUrl: string): string {
  const safeUrl = escapeHtml(returnUrl);
  return `<!doctype html><html lang="zh-CN"><body style="margin:0;background:#f7f4ec;color:#183733;font-family:Arial,sans-serif"><div style="max-width:560px;margin:40px auto;padding:32px;background:#fffdf8;border-radius:18px"><h1 style="font-size:26px">${escapeHtml(title)}</h1><p style="line-height:1.8">${escapeHtml(description)}</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#183733;color:#fffdf8;text-decoration:none">${escapeHtml(action)}</a></p><p style="font-size:12px;color:#687975;word-break:break-all">如果按钮无法使用，请复制此链接：${safeUrl}</p></div></body></html>`;
}

async function digestId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getEmailProvider(): EmailProvider {
  const config = getRuntimeConfig();
  requireConfigKeys(
    config,
    ["emailProviderApiKey", "emailFrom"],
    "Resend 邮件服务配置不完整",
  );
  return new ResendEmailProvider(
    config.emailProviderApiKey as string,
    config.emailFrom as string,
    config.emailReplyTo,
  );
}
