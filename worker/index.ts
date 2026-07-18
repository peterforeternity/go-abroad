/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { logError, logInfo } from "../app/lib/logger";
import { handleCorsPreflight, applySecurityHeaders } from "../app/lib/security";
import { runStudyDataSync } from "../app/lib/providers/study-data-provider";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  KV?: KVNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface SchedulerController {
  cron: string;
  scheduledTime: number;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setWorkerBindings(env);
    const preflight = handleCorsPreflight(request);
    if (preflight) return applySecurityHeaders(preflight, request);

    const url = new URL(request.url);

    try {
      if (url.pathname === "/_vinext/image") {
        const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
        const response = await handleImageOptimization(request, {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          },
        }, allowedWidths);
        return applySecurityHeaders(response, request);
      }

      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(response, request);
    } catch (error) {
      logError("worker_request_error", {
        method: request.method,
        pathname: url.pathname,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return applySecurityHeaders(new Response("Service unavailable", { status: 503 }), request);
    }
  },

  async scheduled(controller: SchedulerController, _env: Env, ctx: ExecutionContext): Promise<void> {
    setWorkerBindings(_env);
    ctx.waitUntil(
      runStudyDataSync()
        .then((result) => logInfo("study_data_sync_completed", { cron: controller.cron, ...result }))
        .catch((error) => {
          const code = typeof (error as { code?: unknown })?.code === "string"
            ? (error as { code: string }).code
            : "UNKNOWN_ERROR";
          logError("study_data_sync_failed", {
            cron: controller.cron,
            code,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }),
    );
  },
};

function setWorkerBindings(bindings: Env): void {
  (globalThis as typeof globalThis & { __QICHENG_WORKER_ENV?: Record<string, unknown> }).__QICHENG_WORKER_ENV = bindings as unknown as Record<string, unknown>;
}

export default worker;
