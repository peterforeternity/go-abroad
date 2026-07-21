import { ApiError } from "../api";
import { getRuntimeConfig, requireConfigKeys } from "../env";
import { getEmailProvider } from "../providers/email-provider";
import type { AuthUser } from "../providers/types";
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from "./crypto";
import {
  createSession,
  createUser,
  findSessionUser,
  findUsableToken,
  findUserByEmail,
  replaceAuthToken,
  resetPassword as persistPasswordReset,
  revokeSession,
  touchSession,
  updateUnverifiedUser,
  verifyEmail as persistEmailVerification,
  type UserRecord,
} from "./repository";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 16_384;

export type RegisterInput = { email: string; password: string; displayName: string };
export type LoginInput = { email: string; password: string };

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "INVALID_EMAIL", "请输入有效的邮箱地址");
  const email = normalizeEmail(value);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new ApiError(400, "INVALID_EMAIL", "请输入有效的邮箱地址");
  }
  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new ApiError(400, "INVALID_PASSWORD", "密码长度必须为 12 到 128 个字符");
  }
  if (!/[A-Za-z]/u.test(value) || !/\d/u.test(value)) {
    throw new ApiError(400, "INVALID_PASSWORD", "密码必须同时包含字母和数字");
  }
  return value;
}

export function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = value.trim();
  if (name.length > 80) throw new ApiError(400, "INVALID_DISPLAY_NAME", "称呼不能超过 80 个字符");
  return name;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "请求必须使用 application/json");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) throw new ApiError(413, "REQUEST_TOO_LARGE", "请求内容过大");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ApiError(413, "REQUEST_TOO_LARGE", "请求内容过大");
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not-object");
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "请求内容不是有效的 JSON 对象");
  }
}

function authConfig() {
  const config = getRuntimeConfig();
  requireConfigKeys(config, ["sessionSecret"], "认证服务配置不完整");
  if ((config.sessionSecret?.length ?? 0) < 32) {
    throw new ApiError(503, "AUTH_CONFIGURATION_ERROR", "认证服务配置尚未完成");
  }
  return config as typeof config & { sessionSecret: string };
}

function publicUser(user: UserRecord): AuthUser {
  return {
    id: String(user.id),
    email: user.email,
    displayName: user.display_name,
    emailVerified: Boolean(user.email_verified_at),
  };
}

function cookieName(appEnv: string): string {
  return appEnv === "development" ? "qicheng_session" : "__Host-qicheng_session";
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionCookie(token: string, appEnv: string, maxAge: number): string {
  return `${cookieName(appEnv)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${appEnv === "development" ? "" : "; Secure"}`;
}

export function clearSessionCookie(appEnv: string): string {
  return `${cookieName(appEnv)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${appEnv === "development" ? "" : "; Secure"}`;
}

async function tokenFor(userId: number, purpose: "email_verification" | "password_reset", ttlMs: number) {
  const config = authConfig();
  const token = createOpaqueToken();
  await replaceAuthToken(
    userId,
    purpose,
    await hashToken(token, config.sessionSecret),
    new Date(Date.now() + ttlMs).toISOString(),
  );
  return token;
}

export async function register(input: RegisterInput): Promise<void> {
  const config = authConfig();
  requireConfigKeys(config, ["siteUrl", "emailProviderApiKey", "emailFrom"], "邮件服务配置不完整");
  const emailProvider = getEmailProvider();
  const passwordHash = await hashPassword(input.password);
  const existing = await findUserByEmail(input.email);
  if (existing?.email_verified_at) {
    throw new ApiError(409, "ACCOUNT_EXISTS", "该邮箱已注册，请直接登录或重置密码");
  }
  const user = existing ?? await createUser(input.email, input.displayName, passwordHash);
  if (existing) await updateUnverifiedUser(existing.id, input.displayName, passwordHash);
  const token = await tokenFor(user.id, "email_verification", VERIFY_TTL_MS);
  await emailProvider.sendVerificationEmail({
    email: input.email,
    token,
    returnUrl: `${config.siteUrl}/?verify_token=${encodeURIComponent(token)}`,
  });
}

export async function login(input: LoginInput): Promise<{ user: AuthUser; cookie: string }> {
  const config = authConfig();
  const user = await findUserByEmail(input.email);
  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "邮箱或密码不正确");
  }
  if (!user.email_verified_at) {
    throw new ApiError(403, "EMAIL_NOT_VERIFIED", "请先完成邮箱验证后再登录");
  }
  const token = createOpaqueToken();
  await createSession(
    user.id,
    await hashToken(token, config.sessionSecret),
    new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString(),
  );
  return { user: publicUser(user), cookie: sessionCookie(token, config.appEnv, config.sessionTtlSeconds) };
}

export async function getSessionUser(request: Request): Promise<AuthUser | null> {
  const config = authConfig();
  const token = readCookie(request, cookieName(config.appEnv));
  if (!token) return null;
  const tokenHash = await hashToken(token, config.sessionSecret);
  const user = await findSessionUser(tokenHash);
  if (!user) return null;
  await touchSession(tokenHash);
  return publicUser(user);
}

export async function logout(request: Request): Promise<string> {
  const config = authConfig();
  const token = readCookie(request, cookieName(config.appEnv));
  if (token) await revokeSession(await hashToken(token, config.sessionSecret));
  return clearSessionCookie(config.appEnv);
}

export async function verifyEmailToken(token: unknown): Promise<void> {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) {
    throw new ApiError(400, "INVALID_VERIFICATION_TOKEN", "验证链接无效或已过期");
  }
  const config = authConfig();
  const record = await findUsableToken(await hashToken(token, config.sessionSecret), "email_verification");
  if (!record) throw new ApiError(400, "INVALID_VERIFICATION_TOKEN", "验证链接无效或已过期");
  await persistEmailVerification(record);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const config = authConfig();
  requireConfigKeys(config, ["siteUrl", "emailProviderApiKey", "emailFrom"], "邮件服务配置不完整");
  const emailProvider = getEmailProvider();
  const user = await findUserByEmail(email);
  if (!user?.email_verified_at) return;
  const token = await tokenFor(user.id, "password_reset", RESET_TTL_MS);
  await emailProvider.sendPasswordResetEmail({
    email,
    token,
    returnUrl: `${config.siteUrl}/?reset_token=${encodeURIComponent(token)}`,
  });
}

export async function completePasswordReset(token: unknown, password: string): Promise<void> {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) {
    throw new ApiError(400, "INVALID_RESET_TOKEN", "重置链接无效或已过期");
  }
  const config = authConfig();
  const record = await findUsableToken(await hashToken(token, config.sessionSecret), "password_reset");
  if (!record) throw new ApiError(400, "INVALID_RESET_TOKEN", "重置链接无效或已过期");
  await persistPasswordReset(record, await hashPassword(password));
}
