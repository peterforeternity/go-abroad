import { logError, logInfo } from "./logger";
import { ConfigurationError } from "./env";
import { getMonitoringProvider } from "./providers/monitoring-provider";

export type ApiMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta: ApiMeta;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ApiMeta;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    publicMessage: string,
    details?: Record<string, unknown>,
  ) {
    super(publicMessage);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.details = details;
  }
}

export type ApiContext = {
  request: Request;
  requestId: string;
};

export type ApiHandler = (context: ApiContext) => Promise<Response>;

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function responseHeaders(requestId: string, extra?: HeadersInit): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Request-ID", requestId);
  if (extra) {
    new Headers(extra).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

export function jsonSuccess<T>(
  data: T,
  requestId: string,
  options: { status?: number; headers?: HeadersInit } = {},
): Response {
  const body: ApiSuccess<T> = {
    ok: true,
    data,
    meta: { requestId, timestamp: new Date().toISOString() },
  };
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: responseHeaders(requestId, options.headers),
  });
}

export function jsonFailure(
  error: ApiError,
  requestId: string,
  headers?: HeadersInit,
): Response {
  const body: ApiFailure = {
    ok: false,
    error: {
      code: error.code,
      message: error.publicMessage,
      ...(error.details ? { details: error.details } : {}),
    },
    meta: { requestId, timestamp: new Date().toISOString() },
  };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: responseHeaders(requestId, headers),
  });
}

export async function withApiHandler(
  request: Request,
  handler: ApiHandler,
): Promise<Response> {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const url = new URL(request.url);

  try {
    const response = await handler({ request, requestId });
    logInfo("api_request", {
      requestId,
      method: request.method,
      pathname: url.pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    const headers = new Headers(response.headers);
    headers.set("X-Request-ID", requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    const apiError = toApiError(error);
    logError("api_error", {
      requestId,
      method: request.method,
      pathname: url.pathname,
      status: apiError.status,
      code: apiError.code,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    void getMonitoringProvider().captureException(error, { requestId, pathname: url.pathname });
    return jsonFailure(apiError, requestId);
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ConfigurationError) {
    return new ApiError(
      503,
      error.code,
      "服务配置尚未完成，请联系管理员",
      error.missingKeys.length > 0 ? { missingKeys: error.missingKeys } : undefined,
    );
  }

  const maybeProviderError = error as { status?: unknown; code?: unknown; publicMessage?: unknown; missingKeys?: unknown };
  if (typeof maybeProviderError.status === "number" && typeof maybeProviderError.code === "string") {
    return new ApiError(
      maybeProviderError.status,
      maybeProviderError.code,
      typeof maybeProviderError.publicMessage === "string"
        ? maybeProviderError.publicMessage
        : "外部服务暂时不可用",
      Array.isArray(maybeProviderError.missingKeys)
        ? { missingKeys: maybeProviderError.missingKeys.map(String) }
        : undefined,
    );
  }

  return new ApiError(500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试");
}
