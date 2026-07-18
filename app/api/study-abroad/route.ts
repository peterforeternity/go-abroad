import { jsonSuccess, withApiHandler } from "../../lib/api";
import { getRuntimeConfig } from "../../lib/env";
import { getCacheProvider } from "../../lib/providers/cache-provider";
import {
  DEFAULT_STUDY_DATA_CACHE_KEY,
  getStudyDataProvider,
} from "../../lib/providers/study-data-provider";
import type { StudyDataQuery } from "../../lib/providers/types";
import { enforceRateLimit, rateLimitHeaders } from "../../lib/rate-limit";
import { parseStudyDataQuery } from "../../lib/validation";
import type { StudyAbroadPayload } from "../../lib/study-abroad-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    const config = getRuntimeConfig();
    const query = parseStudyDataQuery(new URL(request.url).searchParams);
    const rateLimit = await enforceRateLimit(request, "study-data");
    const cacheKey = buildCacheKey(query);
    const cache = getCacheProvider();
    const cached = await cache.get<StudyAbroadPayload>(cacheKey);
    const payload = cached
      ? withCacheMetadata(cached, true)
      : await getStudyDataProvider().getSnapshot(query);

    if (!cached && (!payload.meta.isStale || payload.meta.isDemo)) {
      await cache.set(cacheKey, payload, config.cacheTtlSeconds);
    }

    const etag = `"${payload.meta.dataVersion}"`;
    const headers = {
      ETag: etag,
      "Cache-Control": `public, max-age=60, s-maxage=${config.cacheTtlSeconds}, stale-while-revalidate=600`,
      "X-Data-Source": payload.meta.source,
      "X-Data-Stale": String(payload.meta.isStale),
      "X-Cache-Status": cached ? "HIT" : "MISS",
      ...rateLimitHeaders(rateLimit),
    };

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ...headers, "X-Request-ID": requestId },
      });
    }

    return jsonSuccess(payload, requestId, { headers });
  });
}

function buildCacheKey(query: StudyDataQuery): string {
  if (!query.q && !query.country && !query.type && (query.limit ?? 50) === 50) {
    return DEFAULT_STUDY_DATA_CACHE_KEY;
  }
  return `study-abroad:${JSON.stringify({
    q: query.q ?? "",
    country: query.country ?? "",
    type: query.type ?? "",
    limit: query.limit ?? 50,
  })}`;
}

function withCacheMetadata(payload: StudyAbroadPayload, cacheHit: boolean): StudyAbroadPayload {
  return {
    ...payload,
    meta: {
      ...payload.meta,
      cacheHit,
    },
  };
}
