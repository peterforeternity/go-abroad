import { getRuntimeConfig, getWorkerBinding } from "../env";
import { logWarn } from "../logger";
import type { CacheProvider } from "./types";
import { ProviderNotConfiguredError } from "./types";

type MemoryEntry = {
  expiresAt: number;
  value: unknown;
};

class MemoryCacheProvider implements CacheProvider {
  private readonly entries = new Map<string, MemoryEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

class CacheApiProvider implements CacheProvider {
  constructor(private readonly cache: Cache) {}

  private requestFor(key: string): Request {
    return new Request(`https://cache.internal/${encodeURIComponent(key)}`);
  }

  async get<T>(key: string): Promise<T | null> {
    const response = await this.cache.match(this.requestFor(key));
    if (!response) return null;
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.cache.put(
      this.requestFor(key),
      new Response(JSON.stringify(value), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${ttlSeconds}`,
        },
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(this.requestFor(key));
  }
}

class KvCacheProvider implements CacheProvider {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    return this.kv.get<T>(key, "json");
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}

class UnavailableCacheProvider implements CacheProvider {
  async get<T>(): Promise<T | null> {
    throw new ProviderNotConfiguredError(
      "CACHE_PROVIDER_NOT_CONFIGURED",
      "缓存服务尚未配置，无法安全读取数据",
    );
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    void key;
    void value;
    void ttlSeconds;
    throw new ProviderNotConfiguredError(
      "CACHE_PROVIDER_NOT_CONFIGURED",
      "缓存服务尚未配置，无法安全写入数据",
    );
  }

  async delete(): Promise<void> {
    throw new ProviderNotConfiguredError(
      "CACHE_PROVIDER_NOT_CONFIGURED",
      "缓存服务尚未配置，无法安全删除数据",
    );
  }
}

let developmentCache: MemoryCacheProvider | null = null;

export function getCacheProvider(bindings: { cache?: Cache; kv?: KVNamespace } = {}): CacheProvider {
  const config = getRuntimeConfig();

  if (config.cacheProvider === "memory") {
    developmentCache ??= new MemoryCacheProvider();
    return developmentCache;
  }

  if (config.cacheProvider === "kv") {
    const kv = bindings.kv ?? getWorkerBinding<KVNamespace>("KV");
    if (kv) return new KvCacheProvider(kv);
  }

  if (config.cacheProvider === "cache-api") {
    const cache = bindings.cache ?? (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
    if (cache) return new CacheApiProvider(cache);
  }

  logWarn("cache_provider_unavailable", { provider: config.cacheProvider });
  return new UnavailableCacheProvider();
}
