import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
let worker;

async function render(pathname = "/", init = {}, runtimeEnv = {}) {
  if (!worker) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    ({ default: worker } = await import(workerUrl.href));
  }

  const headers = new Headers({
    accept: pathname === "/" ? "text/html" : "application/json",
  });
  new Headers(init.headers ?? {}).forEach((value, key) => headers.set(key, value));

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      ...init,
      headers,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: undefined,
      ...runtimeEnv,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Study Abroad product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>启程 · Study Abroad<\/title>/i);
  assert.match(html, /把留学这件事/);
  assert.match(html, /实时数据探索/);
  assert.match(html, /你的申请雷达/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("serves cached study-abroad data through the API route", async () => {
  const response = await render("/api/study-abroad");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  assert.equal(response.headers.get("x-data-source"), "demo");
  assert.equal(response.headers.get("x-data-stale"), "true");
  assert.ok(response.headers.get("x-request-id"));
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.meta.source, "demo");
  assert.equal(payload.data.meta.isDemo, true);
  assert.equal(payload.data.meta.lastSyncedAt, null);
  assert.equal(payload.data.destinations.length, 6);
  assert.ok(payload.data.insights.some((item) => item.type === "scholarship"));

  const cached = await render("/api/study-abroad");
  const cachedPayload = await cached.json();
  assert.equal(cachedPayload.data.meta.cacheHit, true);
  assert.equal(cached.headers.get("etag"), response.headers.get("etag"));

  const notModified = await render("/api/study-abroad", {
    headers: { "if-none-match": response.headers.get("etag") },
  });
  assert.equal(notModified.status, 304);
  assert.ok(notModified.headers.get("x-request-id"));
});

test("exposes a safe health status and rejects invalid query parameters", async () => {
  const health = await render("/api/health");
  assert.equal(health.status, 200);
  const healthPayload = await health.json();
  assert.equal(healthPayload.ok, true);
  assert.equal(healthPayload.data.environment, "development");
  assert.equal(healthPayload.data.checks.demoData, true);
  assert.equal(healthPayload.data.checks.studyDataProvider, true);

  const invalid = await render("/api/study-abroad?limit=101");
  assert.equal(invalid.status, 400);
  const invalidPayload = await invalid.json();
  assert.equal(invalidPayload.ok, false);
  assert.equal(invalidPayload.error.code, "INVALID_QUERY_PARAMETER");
});

test("keeps staging health observable while external providers are incomplete", async () => {
  const response = await render(
    "/api/health",
    {},
    {
      APP_ENV: "staging",
      ALLOW_DEMO_DATA: "false",
      CACHE_PROVIDER: "kv",
      RATE_LIMIT_PROVIDER: "external",
      NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
      ALLOWED_ORIGINS: "https://staging.example.test",
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.environment, "staging");
  assert.equal(payload.data.status, "degraded");
  assert.equal(payload.data.ready, false);
  assert.equal(payload.data.checks.demoData, false);
  assert.ok(payload.data.issueKeys.includes("DATA_PROVIDER_BASE_URL"));
});

test("does not expose an unauthorised sync control", async () => {
  const response = await render("/api/study-abroad/sync", { method: "POST" });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "SYNC_AUTH_NOT_CONFIGURED");
});

test("enforces the development CORS allowlist", async () => {
  const response = await render("/api/health", {
    method: "OPTIONS",
    headers: {
      origin: "https://untrusted.example",
      "access-control-request-method": "GET",
    },
  });
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "CORS_ORIGIN_DENIED");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("removes the temporary starter preview and keeps product metadata", async () => {
  await assert.rejects(access(new URL("app/_sites-preview", root)));

  const [page, layout, packageJson, stagingConfig] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("wrangler.staging.example.jsonc", root), "utf8"),
  ]);

  assert.match(page, /STUDY_ABROAD_FALLBACK/);
  assert.match(page, /登录 \/ 注册/);
  assert.match(layout, /title: "启程 · Study Abroad"/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(stagingConfig, /"name": "study-abroad-staging"/);
  assert.match(stagingConfig, /"binding": "DB"/);
  assert.match(stagingConfig, /"binding": "KV"/);
  assert.match(stagingConfig, /"crons": \["\*\/5 \* \* \* \*"\]/);
  assert.match(stagingConfig, /"workers_dev": false/);
  assert.match(stagingConfig, /"preview_urls": false/);
  assert.match(stagingConfig, /"DATA_PROVIDER_MODE": "external"/);
  assert.match(stagingConfig, /"CACHE_PROVIDER": "kv"/);
  assert.match(stagingConfig, /"RATE_LIMIT_PROVIDER": "kv"/);
  assert.match(stagingConfig, /"RATE_LIMIT_REQUESTS": "100"/);
  assert.doesNotMatch(stagingConfig, /"routes"\s*:/);
  assert.doesNotMatch(stagingConfig, /"secrets"\s*:/);
});
