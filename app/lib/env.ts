export type AppEnvironment = "development" | "staging" | "production";
export type DataProviderMode = "demo" | "http";
export type CacheProviderMode = "memory" | "cache-api" | "kv";
export type RateLimitProviderMode = "memory" | "external";

export type RuntimeConfig = {
  appEnv: AppEnvironment;
  siteUrl: string | null;
  allowedOrigins: string[];
  dataProviderMode: DataProviderMode;
  dataProviderBaseUrl: string | null;
  dataProviderApiKey: string | null;
  dataProviderEndpoint: string;
  dataProviderTimeoutMs: number;
  dataProviderRetryCount: number;
  allowDemoData: boolean;
  cacheProvider: CacheProviderMode;
  cacheTtlSeconds: number;
  kvNamespaceBinding: string | null;
  rateLimitProvider: RateLimitProviderMode;
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
  authIssuerUrl: string | null;
  authClientId: string | null;
  authClientSecret: string | null;
  sessionSecret: string | null;
  emailProviderApiKey: string | null;
  emailFrom: string | null;
  emailReplyTo: string | null;
  monitoringDsn: string | null;
  monitoringAuthToken: string | null;
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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
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
  const fallback = value === "production" ? "production" : "development";
  if (value === "development" || value === "staging" || value === "production") {
    return value;
  }
  return fallback;
}

function parseDataProviderMode(value: string | undefined, appEnv: AppEnvironment): DataProviderMode {
  if (value === "http") return "http";
  return appEnv === "development" ? "demo" : "http";
}

function parseCacheProvider(value: string | undefined, appEnv: AppEnvironment): CacheProviderMode {
  if (value === "cache-api" || value === "kv") return value;
  return appEnv === "development" ? "memory" : "cache-api";
}

function parseRateLimitProvider(value: string | undefined, appEnv: AppEnvironment): RateLimitProviderMode {
  return value === "external" || appEnv !== "development" ? "external" : "memory";
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
    dataProviderEndpoint: source.DATA_PROVIDER_ENDPOINT?.trim() || "/study-abroad",
    dataProviderTimeoutMs: Math.min(Math.max(parseInteger(source.DATA_PROVIDER_TIMEOUT_MS, 5000), 500), 15000),
    dataProviderRetryCount: Math.min(Math.max(parseInteger(source.DATA_PROVIDER_RETRY_COUNT, 2), 0), 3),
    allowDemoData: parseBoolean(source.ALLOW_DEMO_DATA, appEnv === "development"),
    cacheProvider: parseCacheProvider(source.CACHE_PROVIDER, appEnv),
    cacheTtlSeconds: Math.min(Math.max(parseInteger(source.CACHE_TTL_SECONDS, 300), 30), 900),
    kvNamespaceBinding: emptyToNull(source.KV_NAMESPACE_BINDING),
    rateLimitProvider: parseRateLimitProvider(source.RATE_LIMIT_PROVIDER, appEnv),
    rateLimitRequests: Math.min(Math.max(parseInteger(source.RATE_LIMIT_REQUESTS, 120), 1), 10000),
    rateLimitWindowSeconds: Math.min(Math.max(parseInteger(source.RATE_LIMIT_WINDOW_SECONDS, 60), 1), 3600),
    authIssuerUrl: emptyToNull(source.AUTH_ISSUER_URL),
    authClientId: emptyToNull(source.AUTH_CLIENT_ID),
    authClientSecret: emptyToNull(source.AUTH_CLIENT_SECRET),
    sessionSecret: emptyToNull(source.SESSION_SECRET),
    emailProviderApiKey: emptyToNull(source.EMAIL_PROVIDER_API_KEY),
    emailFrom: emptyToNull(source.MAIL_FROM),
    emailReplyTo: emptyToNull(source.MAIL_REPLY_TO),
    monitoringDsn: emptyToNull(source.MONITORING_DSN),
    monitoringAuthToken: emptyToNull(source.MONITORING_AUTH_TOKEN),
    dataSyncWebhookSecret: emptyToNull(source.DATA_SYNC_WEBHOOK_SECRET),
  };
}

export function validateRuntimeEnv(
  source: EnvironmentSource = processEnvironment(),
): { config: RuntimeConfig; ok: boolean; issues: ConfigIssue[] } {
  const config = getRuntimeConfig(source);
  const issues: ConfigIssue[] = [];
  const add = (key: string, message: string) => issues.push({ key, message });

  const rawEnvironment = source.APP_ENV ?? source.NODE_ENV;
  if (rawEnvironment && !["development", "staging", "production"].includes(rawEnvironment)) {
    add("APP_ENV", "must be development, staging, or production");
  }

  if (config.appEnv !== "development") {
    if (!config.siteUrl || !config.siteUrl.startsWith("https://")) {
      add("NEXT_PUBLIC_SITE_URL", "must be an https URL outside development");
    }
    if (config.allowedOrigins.length === 0) {
      add("ALLOWED_ORIGINS", "must contain at least one explicit origin outside development");
    }
    if (config.dataProviderMode !== "http") {
      add("DATA_PROVIDER_MODE", "demo data is disabled outside development");
    }
    if (!config.dataProviderBaseUrl) add("DATA_PROVIDER_BASE_URL", "is required for the HTTP provider");
    if (!config.dataProviderApiKey) add("DATA_PROVIDER_API_KEY", "is required for the HTTP provider");
    if (config.cacheProvider === "memory") add("CACHE_PROVIDER", "memory cache is development-only");
    if (config.rateLimitProvider === "memory") add("RATE_LIMIT_PROVIDER", "memory rate limiting is development-only");
    if (!config.authIssuerUrl) add("AUTH_ISSUER_URL", "is required before enabling public authentication");
    if (!config.authClientId) add("AUTH_CLIENT_ID", "is required before enabling public authentication");
    if (!config.authClientSecret) add("AUTH_CLIENT_SECRET", "is required before enabling public authentication");
    if (!config.sessionSecret) add("SESSION_SECRET", "is required for server sessions");
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
