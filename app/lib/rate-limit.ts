import { ApiError } from "./api";
import { getRuntimeConfig, getWorkerBinding } from "./env";
import { logWarn } from "./logger";

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimitProvider = {
  check(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
};

type Counter = {
  count: number;
  resetAt: number;
};

class MemoryRateLimitProvider implements RateLimitProvider {
  private readonly counters = new Map<string, Counter>();

  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const current = this.counters.get(key);
    const counter = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowSeconds * 1000 }
      : current;

    counter.count += 1;
    this.counters.set(key, counter);

    return {
      allowed: counter.count <= limit,
      limit,
      remaining: Math.max(0, limit - counter.count),
      retryAfterSeconds: Math.max(1, Math.ceil((counter.resetAt - now) / 1000)),
    };
  }
}

class UnavailableRateLimitProvider implements RateLimitProvider {
  async check(): Promise<RateLimitDecision> {
    throw new ApiError(
      503,
      "RATE_LIMIT_PROVIDER_NOT_CONFIGURED",
      "限流服务尚未配置，当前环境不能安全提供该接口",
    );
  }
}

class KvRateLimitProvider implements RateLimitProvider {
  constructor(private readonly kv: KVNamespace) {}

  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const bucket = Math.floor(now / (windowSeconds * 1000));
    const storageKey = `rate-limit:${key}:${bucket}`;
    const current = (await this.kv.get<number>(storageKey, "json")) ?? 0;
    const count = current + 1;
    await this.kv.put(storageKey, String(count), { expirationTtl: windowSeconds + 5 });
    const resetAt = (bucket + 1) * windowSeconds * 1000;
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }
}

let developmentProvider: MemoryRateLimitProvider | null = null;

function getProvider(): RateLimitProvider {
  const config = getRuntimeConfig();
  if (config.rateLimitProvider === "memory") {
    developmentProvider ??= new MemoryRateLimitProvider();
    return developmentProvider;
  }
  const kv = getWorkerBinding<KVNamespace>("KV");
  if (kv) return new KvRateLimitProvider(kv);
  return new UnavailableRateLimitProvider();
}

async function clientKey(request: Request, scope: string): Promise<string> {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope}:${ip}`));
  const identifier = Array.from(
    new Uint8Array(digest).slice(0, 16),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${scope}:${identifier}`;
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  options: { limit?: number; windowSeconds?: number } = {},
): Promise<RateLimitDecision> {
  const config = getRuntimeConfig();
  const decision = await getProvider().check(
    await clientKey(request, scope),
    options.limit ?? config.rateLimitRequests,
    options.windowSeconds ?? config.rateLimitWindowSeconds,
  );

  if (!decision.allowed) {
    logWarn("rate_limit_exceeded", { scope, limit: decision.limit });
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "请求过于频繁，请稍后重试",
      { retryAfterSeconds: decision.retryAfterSeconds },
    );
  }

  return decision;
}

export function rateLimitHeaders(decision: RateLimitDecision): HeadersInit {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(decision.retryAfterSeconds),
  };
}
