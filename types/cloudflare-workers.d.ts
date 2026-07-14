interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown>;
}

interface KVNamespace {
  get<T = unknown>(key: string, type?: "json" | "text"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface GlobalThis {
  __QICHENG_WORKER_ENV?: Record<string, unknown>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    KV?: KVNamespace;
    [key: string]: unknown;
  };
}
