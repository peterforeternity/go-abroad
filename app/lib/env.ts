export type AppEnvironment = "development" | "staging" | "production";
export const DATA_PROVIDER_MODES = ["demo", "http", "public-apis"] as const;
export const CACHE_PROVIDER_MODES = ["memory", "cache-api", "kv"] as const;
export const RATE_LIMIT_PROVIDER_MODES = ["memory", "kv"] as const;
export const AUTH_PROVIDER_MODES = ["d1"] as const;
export const EMAIL_PROVIDER_MODES = ["resend"] as const;

export type DataProviderMode = (typeof DATA_PROVIDER_MODES)[number];
export type CacheProviderMode = (typeof CACHE_PROVIDER_MODES)[number];
export type RateLimitProviderMode = (typeof RATE_LIMIT_PROVIDER_MODES)[number];
export type AuthProviderMode = (typeof AUTH_PROVIDER_MODES)[number];
export type EmailProviderMode = (typeof EMAIL_PROVIDER_MODES)[number];

export type RuntimeConfig = {
  appEnv: AppEnvironment;
  siteUrl: string | null;
  allowedOrigins: string[];
  dataProviderMode: DataProviderMode;
  dataProviderBaseUrl: string | null;
  dataProviderApiKey: string | null;
  collegeScorecardApiKey: string | null;
  dataProviderEndpoint: string;
  dataProviderTimeoutMs: number;
  dataProviderRetryCount: number;
  crawlerEnabled: boolean;
  crawlerIntervalSeconds: number;
  crawlerMaxPages: number;
  crawlerMaxBytes: number;
  allowDemoData: boolean;
  cacheProvider: CacheProviderMode;
  cacheTtlSeconds: number;
  kvNamespaceBinding: string | null;
  rateLimitProvider: RateLimitProviderMode;
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
  authProviderMode: AuthProviderMode;
  sessionSecret: string | null;
  sessionTtlSeconds: number;
  emailProviderMode: EmailProviderMode;
  emailProviderApiKey: string | null;
  emailFrom: string | null;
  emailReplyTo: string | null;
  monitoringDsn: string | null;
  monitoringAuthToken: string | null;
  alertWebhookUrl: string | null;
  dataSyncWebhookSecret: string | null;
};

export type ConfigIssue = {
  key: string;
  message: string;
};

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_ERROR";
  readonly missingKeys: string[];

  constructor(message: string, missingKeys: string[] = []) {
    super(message);
    this.name = "ConfigurationError";
    this.missingKeys = missingKeys;
  }
}

type EnvironmentSource = Record<string, string | undefined>;

function processEnvironment(): EnvironmentSource {
  const root = globalThis as typeof globalThis & {
    process?: { env?: EnvironmentSource };
    __QICHENG_WORKER_ENV?: Record<string, unknown>;
  };
  const workerSource = Object.fromEntries(
    Object.entries(root.__QICHENG_WORKER_ENV ?? {}).filter(([, value]) => typeof value === "string"),
  ) as EnvironmentSource;
  return { ...workerSource, ...(root.process?.env ?? {}) };
}

export function getWorkerBinding<T>(key: string): T | undefined {
  const root = globalThis as typeof globalThis & {
    __QICHENG_WORKER_ENV?: Record<string, unknown>;
  };
  return root.__QICHENG_WORKER_ENV?.[key] as T | undefined;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseBoolean(value: string | undefined, fallback: boolean, key: string): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new ConfigurationError(`${key} must be true or false`, [key]);
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEnvironment(value: string | undefined): AppEnvironment {
  if (!value?.trim()) return "development";
  const normalized = value.trim();
  if (normalized === "development" || normalized === "staging" || normalized === "production") {
    return normalized;
  }
  throw new ConfigurationError(
    "APP_ENV must be development, staging, or production",
    ["APP_ENV"],
  );
}

function parseDataProviderMode(value: string | undefined, appEnv: AppEnvironment): DataProviderMode {
  if (!value?.trim()) {
    if (appEnv === "development") return "demo";
    throw new ConfigurationError(
      "DATA_PROVIDER_MODE is required outside development",
      ["DATA_PROVIDER_MODE"],
    );
  }
  const normalized = value.trim();
  if (DATA_PROVIDER_MODES.includes(normalized as DataProviderMode)) return normalized as DataProviderMode;
  throw new ConfigurationError(
    `DATA_PROVIDER_MODE must be one of: ${DATA_PROVIDER_MODES.join(", ")}`,
    ["DATA_PROVIDER_MODE"],
  );
}

function parseCacheProvider(value: string | undefined, appEnv: AppEnvironment): CacheProviderMode {
  if (!value?.trim()) {
    if (appEnv === "development") return "memory";
    throw new ConfigurationError(
      "CACHE_PROVIDER is required outside development",
      ["CACHE_PROVIDER"],
    );
  }
  const normalized = value.trim();
  if (CACHE_PROVIDER_MODES.includes(normalized as CacheProviderMode)) return normalized as CacheProviderMode;
  throw new ConfigurationError(
    `CACHE_PROVIDER must be one of: ${CACHE_PROVIDER_MODES.join(", ")}`,
    ["CACHE_PROVIDER"],
  );
}

function parseRateLimitProvider(value: string | undefined, appEnv: AppEnvironment): RateLimitProviderMode {
  if (!value?.trim()) {
    if (appEnv === "development") return "memory";
    throw new ConfigurationError(
      "RATE_LIMIT_PROVIDER is required outside development",
      ["RATE_LIMIT_PROVIDER"],
    );
  }
  const normalized = value.trim();
  if (RATE_LIMIT_PROVIDER_MODES.includes(normalized as RateLimitProviderMode)) {
    return normalized as RateLimitProviderMode;
  }
  throw new ConfigurationError(
    `RATE_LIMIT_PROVIDER must be one of: ${RATE_LIMIT_PROVIDER_MODES.join(", ")}`,
    ["RATE_LIMIT_PROVIDER"],
  );
}

function parseProviderMode<T extends string>(
  value: string | undefined,
  key: string,
  allowed: readonly T[],
  developmentDefault: T,
  appEnv: AppEnvironment,
): T {
  if (!value?.trim()) {
    if (appEnv === "development") return developmentDefault;
    throw new ConfigurationError(`${key} is required outside development`, [key]);
  }
  const normalized = value.trim();
  if (allowed.includes(normalized as T)) return normalized as T;
  throw new ConfigurationError(`${key} must be one of: ${allowed.join(", ")}`, [key]);
}

export function getRuntimeConfig(source: EnvironmentSource = processEnvironment()): RuntimeConfig {
  const appEnv = parseEnvironment(source.APP_ENV ?? source.NODE_ENV);

  return {
    appEnv,
    siteUrl: emptyToNull(source.NEXT_PUBLIC_SITE_URL),
    allowedOrigins: parseList(source.ALLOWED_ORIGINS),
    dataProviderMode: parseDataProviderMode(source.DATA_PROVIDER_MODE, appEnv),
    dataProviderBaseUrl: emptyToNull(source.DATA_PROVIDER_BASE_URL),
    dataProviderApiKey: emptyToNull(source.DATA_PROVIDER_API_KEY),
    collegeScorecardApiKey: emptyToNull(source.COLLEGE_SCORECARD_API_KEY),
    dataProviderEndpoint: source.DATA_PROVIDER_ENDPOINT?.trim() || "/study-abroad",
    dataProviderTimeoutMs: Math.min(Math.max(parseInteger(source.DATA_PROVIDER_TIMEOUT_MS, 5000), 500), 15000),
    dataProviderRetryCount: Math.min(Math.max(parseInteger(source.DATA_PROVIDER_RETRY_COUNT, 2), 0), 3),
    crawlerEnabled: parseBoolean(source.CRAWLER_ENABLED, false, "CRAWLER_ENABLED"),
    crawlerIntervalSeconds: Math.min(
      Math.max(parseInteger(source.CRAWLER_INTERVAL_SECONDS, 21600), 3600),
      604800,
    ),
    crawlerMaxPages: Math.min(Math.max(parseInteger(source.CRAWLER_MAX_PAGES, 8), 1), 60),
    crawlerMaxBytes: Math.min(Math.max(parseInteger(source.CRAWLER_MAX_BYTES, 1048576), 65536), 2097152),
    allowDemoData: parseBoolean(
      source.ALLOW_DEMO_DATA,
      appEnv === "development",
      "ALLOW_DEMO_DATA",
    ),
    cacheProvider: parseCacheProvider(source.CACHE_PROVIDER, appEnv),
    cacheTtlSeconds: Math.min(Math.max(parseInteger(source.CACHE_TTL_SECONDS, 300), 30), 900),
    kvNamespaceBinding: emptyToNull(source.KV_NAMESPACE_BINDING),
    rateLimitProvider: parseRateLimitProvider(source.RATE_LIMIT_PROVIDER, appEnv),
    rateLimitRequests: Math.min(Math.max(parseInteger(source.RATE_LIMIT_REQUESTS, 120), 1), 10000),
    rateLimitWindowSeconds: Math.min(Math.max(parseInteger(source.RATE_LIMIT_WINDOW_SECONDS, 60), 1), 3600),
    authProviderMode: parseProviderMode(
      source.AUTH_PROVIDER_MODE,
      "AUTH_PROVIDER_MODE",
      AUTH_PROVIDER_MODES,
      "d1",
      appEnv,
    ),
    sessionSecret: emptyToNull(source.SESSION_SECRET),
    sessionTtlSeconds: Math.min(
      Math.max(parseInteger(source.SESSION_TTL_SECONDS, 60 * 60 * 24 * 14), 3600),
      60 * 60 * 24 * 30,
    ),
    emailProviderMode: parseProviderMode(
      source.EMAIL_PROVIDER_MODE,
      "EMAIL_PROVIDER_MODE",
      EMAIL_PROVIDER_MODES,
      "resend",
      appEnv,
    ),
    emailProviderApiKey: emptyToNull(source.EMAIL_PROVIDER_API_KEY),
    emailFrom: emptyToNull(source.MAIL_FROM),
    emailReplyTo: emptyToNull(source.MAIL_REPLY_TO),
    monitoringDsn: emptyToNull(source.MONITORING_DSN),
    monitoringAuthToken: emptyToNull(source.MONITORING_AUTH_TOKEN ?? source.SENTRY_AUTH_TOKEN),
    alertWebhookUrl: emptyToNull(source.ALERT_WEBHOOK_URL),
    dataSyncWebhookSecret: emptyToNull(source.DATA_SYNC_WEBHOOK_SECRET),
  };
}

export function validateRuntimeEnv(
  source: EnvironmentSource = processEnvironment(),
): { config: RuntimeConfig; ok: boolean; issues: ConfigIssue[] } {
  const config = getRuntimeConfig(source);
  const issues: ConfigIssue[] = [];
  const add = (key: string, message: string) => issues.push({ key, message });

  if (config.appEnv !== "development") {
    if (!config.siteUrl || !config.siteUrl.startsWith("https://")) {
      add("NEXT_PUBLIC_SITE_URL", "must be an https URL outside development");
    }
    if (config.allowedOrigins.length === 0) {
      add("ALLOWED_ORIGINS", "must contain at least one explicit origin outside development");
    }
    if (config.dataProviderMode === "demo") {
      add("DATA_PROVIDER_MODE", "demo data is disabled outside development");
    }
    if (config.dataProviderMode === "http") {
      if (!config.dataProviderBaseUrl) add("DATA_PROVIDER_BASE_URL", "is required for the HTTP provider");
      if (!config.dataProviderApiKey) add("DATA_PROVIDER_API_KEY", "is required for the HTTP provider");
    }
    if (config.cacheProvider === "memory") add("CACHE_PROVIDER", "memory cache is development-only");
    if (config.rateLimitProvider !== "kv") add("RATE_LIMIT_PROVIDER", "kv is required outside development");
    if (config.authProviderMode !== "d1") add("AUTH_PROVIDER_MODE", "d1 is required for native authentication");
    if (!config.sessionSecret || config.sessionSecret.length < 32) {
      add("SESSION_SECRET", "must contain at least 32 characters for server sessions");
    }
    if (config.emailProviderMode !== "resend") add("EMAIL_PROVIDER_MODE", "resend is required for transactional email");
    if (!config.emailProviderApiKey) add("EMAIL_PROVIDER_API_KEY", "is required for verification and reset email");
    if (!config.emailFrom) add("MAIL_FROM", "is required for verification and reset email");
    if (!config.monitoringDsn) add("MONITORING_DSN", "is required for production monitoring");
  }

  if (config.appEnv === "development" && config.dataProviderMode === "demo" && !config.allowDemoData) {
    add("ALLOW_DEMO_DATA", "must be true to use the explicit development demo provider");
  }

  return { config, ok: issues.length === 0, issues };
}

export function requireConfigKeys(
  config: RuntimeConfig,
  keys: Array<keyof RuntimeConfig>,
  message: string,
): void {
  const missing = keys.filter((key) => {
    const value = config[key];
    return value === null || value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw new ConfigurationError(message, missing.map(String));
  }
}
