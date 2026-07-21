import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
let worker;

function createKvBinding() {
  const values = new Map();
  return {
    async get(key, type) {
      const value = values.get(key) ?? null;
      if (value === null || type !== "json") return value;
      return JSON.parse(value);
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

function createAuthDbBinding() {
  const state = { users: [], tokens: [], sessions: [] };
  let nextUserId = 1;
  let nextTokenId = 1;
  let nextSessionId = 1;

  function statement(sql) {
    let values = [];
    return {
      bind(...nextValues) {
        values = nextValues;
        return this;
      },
      async first() {
        if (sql.includes("FROM users WHERE email =")) {
          return state.users.find((user) => user.email === values[0]) ?? null;
        }
        if (sql.includes("FROM users WHERE id =")) {
          return state.users.find((user) => user.id === values[0]) ?? null;
        }
        if (sql.startsWith("INSERT INTO users")) {
          const user = {
            id: nextUserId++,
            email: values[0],
            display_name: values[1],
            password_hash: values[2],
            email_verified_at: null,
          };
          state.users.push(user);
          return { ...user };
        }
        if (sql.includes("FROM auth_tokens WHERE token_hash")) {
          const now = new Date().toISOString();
          const token = state.tokens.find((item) =>
            item.token_hash === values[0] &&
            item.purpose === values[1] &&
            item.consumed_at === null &&
            item.expires_at > now,
          );
          return token ? { id: token.id, user_id: token.user_id } : null;
        }
        if (sql.includes("FROM sessions JOIN users")) {
          const now = new Date().toISOString();
          const session = state.sessions.find((item) =>
            item.token_hash === values[0] && item.revoked_at === null && item.expires_at > now,
          );
          const user = session && state.users.find((item) => item.id === session.user_id);
          return user ? { ...user } : null;
        }
        throw new Error(`Unhandled D1 first query: ${sql}`);
      },
      async run() {
        if (sql.startsWith("UPDATE users SET display_name")) {
          const user = state.users.find((item) => item.id === values[2] && item.email_verified_at === null);
          if (user) {
            user.display_name = values[0];
            user.password_hash = values[1];
          }
        } else if (sql.startsWith("DELETE FROM auth_tokens")) {
          state.tokens = state.tokens.filter((item) =>
            !(item.user_id === values[0] && item.purpose === values[1] && item.consumed_at === null),
          );
        } else if (sql.startsWith("INSERT INTO auth_tokens")) {
          state.tokens.push({
            id: nextTokenId++, user_id: values[0], token_hash: values[1], purpose: values[2],
            expires_at: values[3], consumed_at: null,
          });
        } else if (sql.startsWith("UPDATE auth_tokens SET consumed_at")) {
          const token = state.tokens.find((item) => item.id === values[0] && item.consumed_at === null);
          if (token) token.consumed_at = new Date().toISOString();
        } else if (sql.startsWith("UPDATE users SET email_verified_at")) {
          const user = state.users.find((item) => item.id === values[0]);
          if (user && !user.email_verified_at) user.email_verified_at = new Date().toISOString();
        } else if (sql.startsWith("UPDATE users SET password_hash")) {
          const user = state.users.find((item) => item.id === values[1]);
          if (user) user.password_hash = values[0];
        } else if (sql.startsWith("INSERT INTO sessions")) {
          state.sessions.push({
            id: nextSessionId++, user_id: values[0], token_hash: values[1], expires_at: values[2],
            last_seen_at: new Date().toISOString(), revoked_at: null,
          });
        } else if (sql.startsWith("UPDATE sessions SET last_seen_at")) {
          const session = state.sessions.find((item) => item.token_hash === values[0]);
          if (session) session.last_seen_at = new Date().toISOString();
        } else if (sql.startsWith("UPDATE sessions SET revoked_at") && sql.includes("user_id")) {
          for (const session of state.sessions) {
            if (session.user_id === values[0] && session.revoked_at === null) session.revoked_at = new Date().toISOString();
          }
        } else if (sql.startsWith("UPDATE sessions SET revoked_at")) {
          const session = state.sessions.find((item) => item.token_hash === values[0] && item.revoked_at === null);
          if (session) session.revoked_at = new Date().toISOString();
        } else {
          throw new Error(`Unhandled D1 run query: ${sql}`);
        }
        return { success: true };
      },
    };
  }

  return {
    state,
    prepare: statement,
    async batch(statements) {
      for (const item of statements) await item.run();
      return [];
    },
  };
}

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
  assert.match(html, /正在检查数据服务|数据加载中/);
  assert.match(html, /你的申请雷达/);
  assert.doesNotMatch(html, /LIVE DATA|实时数据探索|系统正常|英国 PSW|18 个匹配机会/);
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
      DATA_PROVIDER_MODE: "http",
      CACHE_PROVIDER: "kv",
      RATE_LIMIT_PROVIDER: "kv",
      AUTH_PROVIDER_MODE: "d1",
      EMAIL_PROVIDER_MODE: "resend",
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

test("staging study data fails safely without falling back to demo data", async () => {
  const response = await render(
    "/api/study-abroad",
    {},
    {
      APP_ENV: "staging",
      ALLOW_DEMO_DATA: "false",
      DATA_PROVIDER_MODE: "http",
      CACHE_PROVIDER: "kv",
      RATE_LIMIT_PROVIDER: "kv",
      AUTH_PROVIDER_MODE: "d1",
      EMAIL_PROVIDER_MODE: "resend",
      KV: createKvBinding(),
    },
  );
  assert.equal(response.status, 503);
  const text = await response.text();
  const payload = JSON.parse(text);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "CONFIGURATION_ERROR");
  assert.doesNotMatch(text, /"source":"demo"|"isDemo":true|PSW|奖学金机会/);
});

test("rejects provider enum aliases instead of using implicit fallbacks", async () => {
  for (const [key, value] of [
    ["DATA_PROVIDER_MODE", "external"],
    ["CACHE_PROVIDER", "external"],
    ["RATE_LIMIT_PROVIDER", "external"],
    ["AUTH_PROVIDER_MODE", "external"],
    ["EMAIL_PROVIDER_MODE", "external"],
  ]) {
    const runtimeEnv = {
      APP_ENV: "staging",
      ALLOW_DEMO_DATA: "false",
      DATA_PROVIDER_MODE: "http",
      CACHE_PROVIDER: "kv",
      RATE_LIMIT_PROVIDER: "kv",
      AUTH_PROVIDER_MODE: "d1",
      EMAIL_PROVIDER_MODE: "resend",
      [key]: value,
    };
    const response = await render("/api/health", {}, runtimeEnv);
    assert.equal(response.status, 503, key);
    const payload = await response.json();
    assert.equal(payload.error.code, "CONFIGURATION_ERROR", key);
    assert.deepEqual(payload.error.details.missingKeys, [key]);
  }
});

test("does not expose an unauthorised sync control", async () => {
  const response = await render("/api/study-abroad/sync", { method: "POST" });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "SYNC_AUTH_NOT_CONFIGURED");
});

test("completes the native D1 registration, verification, session, and password-reset lifecycle", async () => {
  const db = createAuthDbBinding();
  const sentEmails = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    assert.match(init.headers.Authorization, /^Bearer /);
    assert.ok(init.headers["Idempotency-Key"]);
    const payload = JSON.parse(init.body);
    assert.doesNotMatch(payload.html, /ValidPassword123|NewValidPassword456/);
    sentEmails.push(payload);
    return new Response(JSON.stringify({ id: `email-${sentEmails.length}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const runtime = {
    DB: db,
    KV: createKvBinding(),
    APP_ENV: "staging",
    ALLOW_DEMO_DATA: "false",
    DATA_PROVIDER_MODE: "http",
    CACHE_PROVIDER: "kv",
    RATE_LIMIT_PROVIDER: "kv",
    AUTH_PROVIDER_MODE: "d1",
    EMAIL_PROVIDER_MODE: "resend",
    SESSION_SECRET: "test-only-session-secret-with-at-least-32-characters",
    NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
    ALLOWED_ORIGINS: "https://staging.example.test",
    EMAIL_PROVIDER_API_KEY: "test-only-resend-key",
    MAIL_FROM: "Qicheng <auth@staging.example.test>",
  };
  const jsonPost = (pathname, body, headers = {}) => render(pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }, runtime);

  try {
    const registration = await jsonPost("/api/auth/register", {
      email: "Student@Example.com",
      password: "ValidPassword123",
      displayName: "测试学生",
    });
    assert.equal(registration.status, 201);
    assert.equal(db.state.users.length, 1);
    assert.equal(db.state.users[0].email, "student@example.com");
    assert.notEqual(db.state.users[0].password_hash, "ValidPassword123");
    assert.equal(sentEmails.length, 1);

    const weakPassword = await jsonPost("/api/auth/register", {
      email: "another@example.com",
      password: "short1",
      displayName: "另一个学生",
    });
    assert.equal(weakPassword.status, 400);
    assert.equal((await weakPassword.json()).error.code, "INVALID_PASSWORD");

    const verifyToken = sentEmails[0].html.match(/verify_token=([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(verifyToken);
    const verification = await jsonPost("/api/auth/verify-email", { token: verifyToken });
    assert.equal(verification.status, 200);
    assert.ok(db.state.users[0].email_verified_at);

    const loginResponse = await jsonPost("/api/auth/login", {
      email: "student@example.com",
      password: "ValidPassword123",
    });
    assert.equal(loginResponse.status, 200);
    const sessionCookie = loginResponse.headers.get("set-cookie");
    assert.match(sessionCookie, /^__Host-qicheng_session=/);
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /SameSite=Strict/);
    assert.match(sessionCookie, /Secure/);

    const cookieHeader = sessionCookie.split(";", 1)[0];
    const me = await render("/api/auth/me", { headers: { Cookie: cookieHeader } }, runtime);
    assert.equal(me.status, 200);
    const mePayload = await me.json();
    assert.equal(mePayload.data.email, "student@example.com");
    assert.equal(mePayload.data.emailVerified, true);

    const forgot = await jsonPost("/api/auth/forgot-password", { email: "student@example.com" });
    assert.equal(forgot.status, 202);
    assert.equal(sentEmails.length, 2);
    const resetToken = sentEmails[1].html.match(/reset_token=([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(resetToken);
    const passwordReset = await jsonPost("/api/auth/reset-password", {
      token: resetToken,
      password: "NewValidPassword456",
    });
    assert.equal(passwordReset.status, 200);

    const oldSession = await render("/api/auth/me", { headers: { Cookie: cookieHeader } }, runtime);
    assert.equal(oldSession.status, 401);
    const oldPassword = await jsonPost("/api/auth/login", {
      email: "student@example.com",
      password: "ValidPassword123",
    });
    assert.equal(oldPassword.status, 401);
    const newPassword = await jsonPost("/api/auth/login", {
      email: "student@example.com",
      password: "NewValidPassword456",
    });
    assert.equal(newPassword.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("keeps staging UI readiness and deployment configuration aligned", async () => {
  await assert.rejects(access(new URL("app/_sites-preview", root)));

  const [page, layout, packageJson, stagingConfig, stagingExample] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("wrangler.staging.jsonc", root), "utf8"),
    readFile(new URL("wrangler.staging.example.jsonc", root), "utf8"),
  ]);

  assert.doesNotMatch(page, /STUDY_ABROAD_FALLBACK/);
  assert.match(page, /useState<StudyAbroadPayload \| null>\(null\)/);
  assert.match(page, /fetch\("\/api\/health"/);
  assert.match(page, /部分服务未配置/);
  assert.match(page, /状态未知/);
  assert.match(page, /liveData \? "LIVE DATA" : data\?\.meta\.isDemo \? "演示数据"/);
  assert.match(page, /setData\(null\)/);
  assert.match(page, /登录 \/ 注册/);
  assert.match(page, /\/api\/auth\/register/);
  assert.match(page, /\/api\/auth\/login/);
  assert.doesNotMatch(page, /验证邮件已发送到你的邮箱（演示）|登录成功，欢迎回来（演示）/);
  assert.match(layout, /title: "启程 · Study Abroad"/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(stagingConfig, /"name": "study-abroad-staging"/);
  assert.match(stagingConfig, /"binding": "DB"/);
  assert.match(stagingConfig, /"binding": "KV"/);
  assert.match(stagingConfig, /"crons"\s*:\s*\[\s*"\*\/5 \* \* \* \*"\s*\]/);
  assert.match(stagingConfig, /"workers_dev": true/);
  assert.match(stagingConfig, /"preview_urls": false/);
  assert.match(stagingConfig, /"DATA_PROVIDER_MODE": "http"/);
  assert.match(stagingConfig, /"CACHE_PROVIDER": "kv"/);
  assert.match(stagingConfig, /"RATE_LIMIT_PROVIDER": "kv"/);
  assert.match(stagingConfig, /"RATE_LIMIT_REQUESTS": "100"/);
  assert.match(stagingConfig, /"AUTH_PROVIDER_MODE": "d1"/);
  assert.match(stagingConfig, /"EMAIL_PROVIDER_MODE": "resend"/);
  assert.match(stagingConfig, /"SESSION_TTL_SECONDS": "1209600"/);
  assert.match(stagingConfig, /"observability"\s*:\s*\{/);
  assert.match(stagingConfig, /"enabled"\s*:\s*true/);
  assert.match(stagingConfig, /"head_sampling_rate"\s*:\s*1/);
  assert.match(stagingConfig, /"invocation_logs"\s*:\s*false/);
  assert.doesNotMatch(stagingConfig, /"routes"\s*:/);
  assert.doesNotMatch(stagingConfig, /"secrets"\s*:/);
  assert.match(stagingExample, /"DATA_PROVIDER_MODE": "http"/);
  assert.match(stagingExample, /"AUTH_PROVIDER_MODE": "d1"/);
  assert.match(stagingExample, /"EMAIL_PROVIDER_MODE": "resend"/);
  assert.match(stagingExample, /"observability"\s*:\s*\{/);
  assert.match(stagingExample, /"invocation_logs"\s*:\s*false/);
});
