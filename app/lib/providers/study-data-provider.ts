import {
  getRuntimeConfig,
  requireConfigKeys,
  type RuntimeConfig,
} from "../env";
import { getStudyAbroadPayload, type StudyAbroadPayload } from "../study-abroad-data";
import { logWarn } from "../logger";
import { getCacheProvider } from "./cache-provider";
import type {
  StudyDataProvider,
  StudyDataQuery,
  StudyDataSnapshot,
  StudyDataSyncResult,
} from "./types";
import { ProviderNotConfiguredError, UpstreamProviderError } from "./types";

export const DEFAULT_STUDY_DATA_CACHE_KEY = "study-abroad:{\"q\":\"\",\"country\":\"\",\"type\":\"\",\"limit\":50}";

const lastKnownGoodUpstream = new Map<string, StudyAbroadPayload>();

class DemoStudyDataProvider implements StudyDataProvider {
  async getSnapshot(query: StudyDataQuery): Promise<StudyDataSnapshot> {
    const fallback = getStudyAbroadPayload();
    const normalizedQuery = query.q?.toLowerCase();
    const insights = fallback.insights
      .filter((item) => !query.type || item.type === query.type)
      .filter((item) => !query.country || item.country === query.country)
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [item.title, item.summary, item.country, item.meta, ...item.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, query.limit ?? 50);

    return {
      ...fallback,
      insights,
      meta: {
        ...fallback.meta,
        source: "demo",
        dataVersion: fallback.meta.dataVersion,
        version: fallback.meta.dataVersion,
        lastSynced: null,
        lastSyncedAt: null,
        isStale: true,
        isDemo: true,
        cacheHit: false,
      },
    };
  }

  async sync(): Promise<StudyDataSyncResult> {
    throw new ProviderNotConfiguredError(
      "DEMO_SYNC_DISABLED",
      "当前为演示数据源，未配置真实数据供应商，不能伪造同步结果",
    );
  }
}

class HttpStudyDataProvider implements StudyDataProvider {
  constructor(private readonly config: RuntimeConfig) {}

  async getSnapshot(query: StudyDataQuery): Promise<StudyDataSnapshot> {
    const endpoint = this.buildEndpoint(query);
    try {
      const raw = await this.fetchWithRetry(endpoint);
      const snapshot = normalizeUpstreamPayload(raw);
      lastKnownGoodUpstream.set(queryCacheKey(query), snapshot);
      return snapshot;
    } catch (error) {
      const fallback = lastKnownGoodUpstream.get(queryCacheKey(query));
      if (!fallback) throw error;
      logWarn("study_data_upstream_degraded", {
        fallback: "last_known_good",
        dataVersion: fallback.meta.dataVersion,
      });
      return {
        ...fallback,
        meta: {
          ...fallback.meta,
          freshness: "上游暂时不可用，返回上次成功同步的数据",
          isStale: true,
          isDemo: false,
          cacheHit: false,
          generatedAt: new Date().toISOString(),
        },
      };
    }
  }

  async sync(): Promise<StudyDataSyncResult> {
    const snapshot = await this.getSnapshot({});
    if (snapshot.meta.isStale) throw new UpstreamProviderError("UPSTREAM_STALE_NOT_SYNCED");
    return {
      synced: true,
      source: snapshot.meta.source,
      dataVersion: snapshot.meta.dataVersion,
      lastSyncedAt: snapshot.meta.lastSyncedAt,
      message: "已从真实数据供应商同步",
    };
  }

  private buildEndpoint(query: StudyDataQuery): URL {
    if (!this.config.dataProviderBaseUrl) {
      throw new ProviderNotConfiguredError(
        "DATA_PROVIDER_NOT_CONFIGURED",
        "留学数据供应商尚未配置",
      );
    }

    const endpoint = new URL(this.config.dataProviderEndpoint, this.config.dataProviderBaseUrl);
    if (query.q) endpoint.searchParams.set("q", query.q);
    if (query.country) endpoint.searchParams.set("country", query.country);
    if (query.type) endpoint.searchParams.set("type", query.type);
    if (query.limit) endpoint.searchParams.set("limit", String(query.limit));
    return endpoint;
  }

  private async fetchWithRetry(endpoint: URL): Promise<unknown> {
    const attempts = this.config.dataProviderRetryCount + 1;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.dataProviderTimeoutMs);
      try {
        const response = await fetch(endpoint, {
          headers: {
            Accept: "application/json",
            "X-API-Key": this.config.dataProviderApiKey ?? "",
          },
          signal: controller.signal,
        });

        if (response.ok) return await response.json();

        if (response.status < 500 && response.status !== 429) {
          throw new UpstreamProviderError("UPSTREAM_REJECTED", `upstream_status_${response.status}`);
        }
        lastError = new UpstreamProviderError("UPSTREAM_RETRYABLE", `upstream_status_${response.status}`);
      } catch (error) {
        lastError = error;
        if (error instanceof UpstreamProviderError && error.code === "UPSTREAM_REJECTED") throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }

    throw lastError instanceof UpstreamProviderError
      ? lastError
      : new UpstreamProviderError("UPSTREAM_TIMEOUT");
  }
}

export function getStudyDataProvider(): StudyDataProvider {
  const config = getRuntimeConfig();

  if (config.dataProviderMode === "demo") {
    if (config.appEnv === "development" && config.allowDemoData) return new DemoStudyDataProvider();
    throw new ProviderNotConfiguredError(
      "DEMO_PROVIDER_DISABLED",
      "非开发环境禁止使用演示数据源，请配置真实留学数据供应商",
    );
  }

  requireConfigKeys(
    config,
    ["dataProviderBaseUrl", "dataProviderApiKey"],
    "留学数据供应商配置不完整",
  );
  return new HttpStudyDataProvider(config);
}

export async function runStudyDataSync(): Promise<StudyDataSyncResult> {
  const provider = getStudyDataProvider();
  const snapshot = await provider.getSnapshot({});
  if (snapshot.meta.isDemo) {
    throw new ProviderNotConfiguredError(
      "DEMO_SYNC_DISABLED",
      "当前为演示数据源，未配置真实数据供应商，不能伪造同步结果",
    );
  }
  if (snapshot.meta.isStale) throw new UpstreamProviderError("UPSTREAM_STALE_NOT_SYNCED");

  const config = getRuntimeConfig();
  const cache = getCacheProvider();
  await cache.set(DEFAULT_STUDY_DATA_CACHE_KEY, snapshot, config.cacheTtlSeconds);
  return {
    synced: true,
    source: snapshot.meta.source,
    dataVersion: snapshot.meta.dataVersion,
    lastSyncedAt: snapshot.meta.lastSyncedAt,
    message: "已从真实数据供应商同步并写入缓存",
  };
}

function queryCacheKey(query: StudyDataQuery): string {
  return JSON.stringify({
    q: query.q ?? "",
    country: query.country ?? "",
    type: query.type ?? "",
    limit: query.limit ?? 50,
  });
}

function normalizeUpstreamPayload(raw: unknown): StudyAbroadPayload {
  const candidate = isRecord(raw) && "data" in raw ? raw.data : raw;
  if (!isValidStudyPayload(candidate)) {
    throw new UpstreamProviderError("UPSTREAM_INVALID_PAYLOAD");
  }

  const now = new Date().toISOString();
  const upstreamMeta: Record<string, unknown> = isRecord(candidate.meta) ? candidate.meta : {};
  const dataVersion = typeof upstreamMeta.dataVersion === "string"
    ? upstreamMeta.dataVersion
    : typeof upstreamMeta.version === "string"
      ? upstreamMeta.version
      : `upstream-${now}`;

  return {
    ...candidate,
    meta: {
      ...candidate.meta,
      version: dataVersion,
      dataVersion,
      source: "upstream",
      freshness: "来自真实数据供应商",
      lastSynced: now,
      lastSyncedAt: now,
      isStale: false,
      isDemo: false,
      generatedAt: now,
      cacheTtlSeconds: getRuntimeConfig().cacheTtlSeconds,
      cacheHit: false,
    },
  };
}

function isValidStudyPayload(value: unknown): value is StudyAbroadPayload {
  if (!isRecord(value)) return false;
  return Array.isArray(value.stats) && Array.isArray(value.destinations) && Array.isArray(value.insights) && isRecord(value.meta);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
