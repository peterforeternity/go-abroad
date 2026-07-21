import type { RuntimeConfig } from "../env";
import {
  crawledPagesToInsights,
  readCuratedCrawlSnapshot,
  refreshCuratedSources,
} from "../crawler/curated-source-crawler";
import type { Destination, Insight, StudyAbroadPayload } from "../study-abroad-data";
import type { StudyDataProvider, StudyDataQuery, StudyDataSyncResult } from "./types";
import { UpstreamProviderError } from "./types";

const COUNTRIES = [
  { code: "GB", country: "英国", flag: "🇬🇧", region: "Europe / 欧洲", color: "coral" },
  { code: "US", country: "美国", flag: "🇺🇸", region: "North America / 北美", color: "ink" },
  { code: "CA", country: "加拿大", flag: "🇨🇦", region: "North America / 北美", color: "sage" },
  { code: "AU", country: "澳大利亚", flag: "🇦🇺", region: "Oceania / 大洋洲", color: "sun" },
  { code: "SG", country: "新加坡", flag: "🇸🇬", region: "Asia / 亚洲", color: "lavender" },
  { code: "JP", country: "日本", flag: "🇯🇵", region: "Asia / 亚洲", color: "blue" },
] as const;

type OpenAlexInstitution = {
  id: string;
  display_name: string;
  country_code: string;
  cited_by_count: number;
  works_count: number;
  homepage_url: string | null;
  updated_date: string;
};

type OpenAlexResponse = { results?: OpenAlexInstitution[] };
type GovUkResult = { title: string; description?: string; link: string; public_timestamp?: string };
type GovUkResponse = { results?: GovUkResult[] };
type FederalRegisterResult = {
  title: string;
  abstract?: string;
  document_number: string;
  html_url: string;
  publication_date: string;
  type?: string;
};
type FederalRegisterResponse = { results?: FederalRegisterResult[] };

type SourceResult = {
  id: string;
  label: string;
  url: string;
  insights: Insight[];
  destinations?: Destination[];
};

export class PublicApisStudyDataProvider implements StudyDataProvider {
  constructor(private readonly config: RuntimeConfig) {}

  async getSnapshot(query: StudyDataQuery): Promise<StudyAbroadPayload> {
    const [settled, crawlSnapshot] = await Promise.all([
      Promise.allSettled([
      this.loadOpenAlex(),
      this.loadGovUk(),
      this.loadFederalRegister(),
      ]),
      readCuratedCrawlSnapshot(),
    ]);
    const successful = settled
      .filter((item): item is PromiseFulfilledResult<SourceResult> => item.status === "fulfilled")
      .map((item) => item.value);

    if (successful.length === 0) {
      throw new UpstreamProviderError("PUBLIC_APIS_UNAVAILABLE");
    }

    const now = new Date().toISOString();
    const partial = successful.length !== settled.length;
    const crawledInsights = crawledPagesToInsights(crawlSnapshot);
    const allInsights = [...successful.flatMap((source) => source.insights), ...crawledInsights];
    const filteredInsights = filterInsights(allInsights, query);
    const destinations = successful.flatMap((source) => source.destinations ?? []);
    const sourceIds = successful.map((source) => source.id);
    const dataVersion = await digestVersion(JSON.stringify({ sourceIds, destinations, allInsights }));
    const institutionCount = allInsights.filter((item) => item.type === "university").length;
    const policyCount = allInsights.filter((item) => item.type === "policy").length;

    return {
      meta: {
        version: dataVersion,
        dataVersion,
        source: [...sourceIds, ...(crawledInsights.length > 0 ? ["official-pages"] : [])].join("+") || "public-apis",
        freshness: partial
          ? "部分公开数据源暂时不可用；仅展示已成功获取且可追溯的内容"
          : "来自无需业务密钥的公开数据接口；请以链接中的原始发布方内容为准",
        lastSynced: now,
        lastSyncedAt: now,
        isStale: partial,
        isDemo: false,
        generatedAt: now,
        cacheTtlSeconds: this.config.cacheTtlSeconds,
        cacheHit: false,
        sources: [...settled.map((item, index) => {
          const definitions = [
            { id: "openalex", label: "OpenAlex", url: "https://openalex.org" },
            { id: "govuk", label: "GOV.UK", url: "https://www.gov.uk" },
            { id: "federal-register", label: "Federal Register", url: "https://www.federalregister.gov" },
          ];
          return { ...definitions[index], status: item.status === "fulfilled" ? "ok" as const : "unavailable" as const };
        }), {
          id: "official-pages",
          label: "Curated official pages",
          url: "https://study-abroad-staging.qicheng-study.workers.dev",
          status: crawlerStatus(crawlSnapshot, this.config.crawlerIntervalSeconds),
        }],
      },
      stats: [
        { value: String(new Set(destinations.map((item) => item.country)).size), label: "有院校记录的国家" },
        { value: String(institutionCount), label: "公开院校记录" },
        { value: String(policyCount), label: "政府政策文件" },
        { value: String(allInsights.filter((item) => item.type === "major" || item.type === "scholarship").length), label: "课程与奖学金来源" },
      ],
      destinations,
      insights: filteredInsights,
    };
  }

  async sync(): Promise<StudyDataSyncResult> {
    const snapshot = await this.getSnapshot({});
    if (snapshot.meta.isStale) throw new UpstreamProviderError("PUBLIC_APIS_PARTIAL_NOT_SYNCED");
    return {
      synced: true,
      source: snapshot.meta.source,
      dataVersion: snapshot.meta.dataVersion,
      lastSyncedAt: snapshot.meta.lastSyncedAt,
      message: "已从公开数据接口同步",
    };
  }

  async refresh(): Promise<void> {
    await refreshCuratedSources(this.config);
  }

  private async loadOpenAlex(): Promise<SourceResult> {
    const endpoint = new URL("https://api.openalex.org/institutions");
    endpoint.searchParams.set("filter", `country_code:${COUNTRIES.map((item) => item.code).join("|")},type:education`);
    endpoint.searchParams.set("sort", "cited_by_count:desc");
    endpoint.searchParams.set("per-page", "48");
    endpoint.searchParams.set("select", "id,display_name,country_code,cited_by_count,works_count,homepage_url,updated_date");
    const payload = await this.fetchJson<OpenAlexResponse>(endpoint);
    const institutions = Array.isArray(payload.results) ? payload.results : [];
    const grouped = new Map<string, OpenAlexInstitution[]>();
    for (const institution of institutions) {
      const list = grouped.get(institution.country_code) ?? [];
      if (list.length < 4) list.push(institution);
      grouped.set(institution.country_code, list);
    }
    const selected = [...grouped.values()].flat();
    const insights: Insight[] = selected.map((institution) => {
      const country = COUNTRIES.find((item) => item.code === institution.country_code);
      const sourceUrl = safeExternalUrl(institution.homepage_url) ?? institution.id;
      return {
        id: `openalex-${institution.id.split("/").pop()}`,
        type: "university",
        icon: "✦",
        title: institution.display_name,
        summary: `OpenAlex 收录 ${formatCount(institution.works_count)} 条研究成果记录；该指标不等同于院校排名。`,
        country: country?.country ?? institution.country_code,
        meta: "公开院校记录 · OpenAlex",
        updated: formatDate(institution.updated_date),
        tags: ["院校", "研究记录", "OpenAlex"],
        accent: country?.color ?? "ink",
        detail: [
          `OpenAlex 当前关联 ${formatCount(institution.works_count)} 条研究成果和 ${formatCount(institution.cited_by_count)} 次引用。`,
          "这些是开放学术图谱统计，不是综合排名、录取概率或教学质量评价。",
          "课程、申请要求与学费请继续在院校官网核实。",
        ],
        sourceLabel: "OpenAlex / 院校官网",
        sourceUrl,
      };
    });
    const destinations: Destination[] = COUNTRIES.flatMap((country) => {
      const count = grouped.get(country.code)?.length ?? 0;
      if (!count) return [];
      return [{
        id: country.code.toLowerCase(),
        country: country.country,
        flag: country.flag,
        region: country.region,
        cities: "公开院校记录",
        headline: "查看可追溯的开放院校与研究记录",
        description: "当前展示 OpenAlex 开放学术图谱中的部分院校记录，不代表官方排名或完整院校清单。",
        stat: String(count),
        statLabel: "所列院校",
        color: country.color,
        trend: "公开数据",
        trendTone: "steady",
        tags: ["OpenAlex", "来源可查"],
      }];
    });
    return { id: "openalex", label: "OpenAlex", url: "https://openalex.org", insights, destinations };
  }

  private async loadGovUk(): Promise<SourceResult> {
    const endpoint = new URL("https://www.gov.uk/api/search.json");
    endpoint.searchParams.set("q", "student visa international students");
    endpoint.searchParams.set("count", "6");
    endpoint.searchParams.set("fields", "title,description,link,public_timestamp");
    const payload = await this.fetchJson<GovUkResponse>(endpoint);
    const insights: Insight[] = (payload.results ?? []).map((item, index) => ({
      id: `govuk-${index}-${slug(item.link)}`,
      type: "policy",
      icon: "↗",
      title: item.title,
      summary: item.description || "GOV.UK 发布的国际学生相关官方内容。",
      country: "英国",
      meta: "政府政策文件 · GOV.UK",
      updated: formatDate(item.public_timestamp),
      tags: ["英国", "政策", "GOV.UK"],
      accent: "coral",
      detail: ["此条目来自 GOV.UK 公开搜索接口。", "签证与申请政策可能变化，请打开来源页面核对适用日期和完整条件。"],
      sourceLabel: "GOV.UK",
      sourceUrl: new URL(item.link, "https://www.gov.uk").toString(),
    }));
    return { id: "govuk", label: "GOV.UK", url: "https://www.gov.uk", insights };
  }

  private async loadFederalRegister(): Promise<SourceResult> {
    const endpoint = new URL("https://www.federalregister.gov/api/v1/documents.json");
    endpoint.searchParams.set("conditions[term]", "student visa international student");
    endpoint.searchParams.set("per_page", "6");
    endpoint.searchParams.set("order", "newest");
    const payload = await this.fetchJson<FederalRegisterResponse>(endpoint);
    const insights: Insight[] = (payload.results ?? []).map((item) => ({
      id: `federal-register-${item.document_number}`,
      type: "policy",
      icon: "↗",
      title: item.title,
      summary: item.abstract || "美国 Federal Register 发布的法规或公告记录。",
      country: "美国",
      meta: `${item.type ?? "政府文件"} · Federal Register`,
      updated: formatDate(item.publication_date),
      tags: ["美国", "政策", "Federal Register"],
      accent: "ink",
      detail: ["此条目来自 FederalRegister.gov 公开接口。", "该站点提供信息检索；涉及法律判断时应核对对应的 govinfo.gov 官方版本。"],
      sourceLabel: "Federal Register",
      sourceUrl: safeExternalUrl(item.html_url) ?? "https://www.federalregister.gov",
    }));
    return { id: "federal-register", label: "Federal Register", url: "https://www.federalregister.gov", insights };
  }

  private async fetchJson<T>(endpoint: URL): Promise<T> {
    const attempts = this.config.dataProviderRetryCount + 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.dataProviderTimeoutMs);
      try {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: controller.signal });
        if (response.ok) return await response.json() as T;
        if (response.status < 500 && response.status !== 429) {
          throw new UpstreamProviderError("PUBLIC_API_REJECTED", `${endpoint.hostname}:${response.status}`);
        }
        lastError = new UpstreamProviderError("PUBLIC_API_RETRYABLE", `${endpoint.hostname}:${response.status}`);
      } catch (error) {
        lastError = error;
        if (error instanceof UpstreamProviderError && error.code === "PUBLIC_API_REJECTED") throw error;
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
    throw lastError instanceof Error ? lastError : new UpstreamProviderError("PUBLIC_API_TIMEOUT");
  }
}

function filterInsights(insights: Insight[], query: StudyDataQuery): Insight[] {
  const normalized = query.q?.trim().toLowerCase();
  return insights
    .filter((item) => !query.type || item.type === query.type)
    .filter((item) => !query.country || item.country === query.country)
    .filter((item) => !normalized || [item.title, item.summary, item.country, item.meta, ...item.tags].join(" ").toLowerCase().includes(normalized))
    .slice(0, query.limit ?? 50);
}

function formatCount(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat("zh-CN").format(value) : "0";
}

function formatDate(value?: string): string {
  if (!value) return "日期未提供";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期未提供" : date.toISOString().slice(0, 10);
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(-48) || "document";
}

function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function digestVersion(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `public-${Array.from(new Uint8Array(digest)).slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function crawlerStatus(
  snapshot: Awaited<ReturnType<typeof readCuratedCrawlSnapshot>>,
  intervalSeconds: number,
): "ok" | "stale" | "unavailable" {
  if (!snapshot?.lastSuccessAt || snapshot.pages.length === 0) return "unavailable";
  const age = Date.now() - Date.parse(snapshot.lastSuccessAt);
  return Number.isFinite(age) && age <= intervalSeconds * 2 * 1000 ? "ok" : "stale";
}
