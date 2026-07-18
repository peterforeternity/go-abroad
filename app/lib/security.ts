import { jsonFailure, ApiError, createRequestId } from "./api";
import { getRuntimeConfig } from "./env";

const DEFAULT_DEV_ORIGIN = "http://localhost:3000";

export function handleCorsPreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;

  const origin = request.headers.get("Origin");
  if (!origin) return new Response(null, { status: 204 });
  if (!isAllowedOrigin(origin)) {
    const requestId = createRequestId();
    return jsonFailure(
      new ApiError(403, "CORS_ORIGIN_DENIED", "请求来源不在允许范围内"),
      requestId,
    );
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

export function applySecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);

  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");

  if (new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(origin)) {
    for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isAllowedOrigin(origin: string): boolean {
  let config: ReturnType<typeof getRuntimeConfig>;
  try {
    config = getRuntimeConfig();
  } catch {
    // Invalid runtime configuration must fail closed without suppressing an
    // already-structured API error response.
    return false;
  }
  const allowedOrigins = config.allowedOrigins.length
    ? config.allowedOrigins
    : config.appEnv === "development"
      ? [DEFAULT_DEV_ORIGIN]
      : [];
  return allowedOrigins.includes(origin);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
