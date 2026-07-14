import { ApiError } from "./api";
import type { InsightType } from "./study-abroad-data";
import type { StudyDataQuery } from "./providers/types";

const ALLOWED_QUERY_KEYS = new Set(["q", "country", "type", "limit"]);
const ALLOWED_TYPES = new Set<InsightType>(["policy", "university", "major", "scholarship"]);

export function parseStudyDataQuery(searchParams: URLSearchParams): StudyDataQuery {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw new ApiError(400, "INVALID_QUERY_PARAMETER", `不支持的查询参数：${key}`);
    }
  }

  const q = optionalText(searchParams.get("q"), "q", 100);
  const country = optionalText(searchParams.get("country"), "country", 64);
  const type = searchParams.get("type");
  const limitValue = searchParams.get("limit");

  if (type && !ALLOWED_TYPES.has(type as InsightType)) {
    throw new ApiError(400, "INVALID_QUERY_PARAMETER", "type 参数不合法");
  }

  let limit: number | undefined;
  if (limitValue !== null) {
    if (!/^\d+$/.test(limitValue)) {
      throw new ApiError(400, "INVALID_QUERY_PARAMETER", "limit 必须是正整数");
    }
    limit = Number(limitValue);
    if (limit < 1 || limit > 100) {
      throw new ApiError(400, "INVALID_QUERY_PARAMETER", "limit 必须在 1 到 100 之间");
    }
  }

  return {
    ...(q ? { q } : {}),
    ...(country ? { country } : {}),
    ...(type ? { type: type as InsightType } : {}),
    ...(limit ? { limit } : {}),
  };
}

function optionalText(value: string | null, key: string, maxLength: number): string | undefined {
  if (value === null) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new ApiError(400, "INVALID_QUERY_PARAMETER", `${key} 超出长度限制`);
  }
  return normalized;
}
