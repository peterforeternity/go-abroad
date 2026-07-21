import type { RuntimeConfig } from "../env";
import { logInfo, logWarn } from "../logger";
import type { Insight, InsightType } from "../study-abroad-data";
import { getCacheProvider } from "../providers/cache-provider";

export const CURATED_CRAWL_CACHE_KEY = "study-crawler:curated:v3";
export const CURATED_UNIVERSITY_SOURCE_COUNT = 50;
const CRAWLER_USER_AGENT = "QichengStudyBot/1.0 (+https://study-abroad-staging.qicheng-study.workers.dev/)";
const RETENTION_SECONDS = 60 * 60 * 24 * 7;
const CRAWL_CONCURRENCY = 4;
const ALLOWED_HOSTS = new Set<string>();

type CrawlSeed = {
  id: string;
  url: string;
  label: string;
  country: string;
  type: InsightType;
  accent: string;
  tags: string[];
};

const ADDITIONAL_UNIVERSITY_PAGES = [
  ["caltech", "https://www.caltech.edu/admissions", "California Institute of Technology", "美国", "ink"],
  ["columbia", "https://www.columbia.edu/content/admissions", "Columbia University", "美国", "ink"],
  ["uchicago", "https://grad.uchicago.edu/admissions/", "University of Chicago", "美国", "ink"],
  ["upenn", "https://www.upenn.edu/admissions", "University of Pennsylvania", "美国", "ink"],
  ["cornell", "https://gradschool.cornell.edu/admissions/", "Cornell University", "美国", "ink"],
  ["johns-hopkins", "https://grad.jhu.edu/admissions/", "Johns Hopkins University", "美国", "ink"],
  ["northwestern", "https://www.tgs.northwestern.edu/admission/", "Northwestern University", "美国", "ink"],
  ["duke", "https://gradschool.duke.edu/admissions/", "Duke University", "美国", "ink"],
  ["michigan", "https://rackham.umich.edu/admissions/", "University of Michigan", "美国", "ink"],
  ["ucla", "https://grad.ucla.edu/admissions/", "University of California, Los Angeles", "美国", "ink"],
  ["ucsd", "https://grad.ucsd.edu/admissions/", "University of California San Diego", "美国", "ink"],
  ["nyu", "https://www.nyu.edu/admissions.html", "New York University", "美国", "ink"],
  ["carnegie-mellon", "https://www.cmu.edu/graduate/admissions/index.html", "Carnegie Mellon University", "美国", "ink"],
  ["brown", "https://graduateschool.brown.edu/admission", "Brown University", "美国", "ink"],
  ["washington", "https://grad.uw.edu/admission/", "University of Washington", "美国", "ink"],
  ["edinburgh", "https://www.ed.ac.uk/studying/postgraduate/applying", "University of Edinburgh", "英国", "coral"],
  ["manchester", "https://www.manchester.ac.uk/study/masters/admissions/", "University of Manchester", "英国", "coral"],
  ["kings-college-london", "https://www.kcl.ac.uk/study/postgraduate-taught/how-to-apply", "King's College London", "英国", "coral"],
  ["lse", "https://www.lse.ac.uk/study-at-lse/Graduate/Prospective-students/How-to-Apply", "London School of Economics", "英国", "coral"],
  ["bristol", "https://www.bristol.ac.uk/study/postgraduate/apply/", "University of Bristol", "英国", "coral"],
  ["warwick", "https://warwick.ac.uk/study/postgraduate/apply/", "University of Warwick", "英国", "coral"],
  ["toronto", "https://www.sgs.utoronto.ca/admissions/", "University of Toronto", "加拿大", "sage"],
  ["ubc", "https://www.grad.ubc.ca/prospective-students/application-admission", "University of British Columbia", "加拿大", "sage"],
  ["mcgill", "https://www.mcgill.ca/gradapplicants/how-apply", "McGill University", "加拿大", "sage"],
  ["waterloo", "https://uwaterloo.ca/graduate-studies-postdoctoral-affairs/future-students/applying-graduate-school", "University of Waterloo", "加拿大", "sage"],
  ["alberta", "https://www.ualberta.ca/en/graduate-studies/prospective-students/apply-for-admission/index.html", "University of Alberta", "加拿大", "sage"],
  ["melbourne", "https://study.unimelb.edu.au/how-to-apply/graduate-study", "University of Melbourne", "澳大利亚", "sun"],
  ["sydney", "https://www.sydney.edu.au/study/applying/how-to-apply/postgraduate.html", "University of Sydney", "澳大利亚", "sun"],
  ["unsw", "https://www.unsw.edu.au/study/how-to-apply/postgraduate", "UNSW Sydney", "澳大利亚", "sun"],
  ["anu", "https://study.anu.edu.au/apply/postgraduate", "Australian National University", "澳大利亚", "sun"],
  ["monash", "https://www.monash.edu/study/how-to-apply/graduate-coursework", "Monash University", "澳大利亚", "sun"],
  ["queensland", "https://study.uq.edu.au/admissions/postgraduate-coursework", "University of Queensland", "澳大利亚", "sun"],
  ["nus", "https://nus.edu.sg/registrar/academic-information-policies/graduate/graduate-admissions", "National University of Singapore", "新加坡", "lavender"],
  ["ntu-singapore", "https://www.ntu.edu.sg/admissions/graduate", "Nanyang Technological University", "新加坡", "lavender"],
  ["hku", "https://gradsch.hku.hk/prospective_students/application/how_to_apply", "University of Hong Kong", "中国香港", "lavender"],
  ["cuhk", "https://www.gs.cuhk.edu.hk/admissions/", "Chinese University of Hong Kong", "中国香港", "lavender"],
  ["hkust", "https://fytgs.hkust.edu.hk/admissions/Admission-to-Postgraduate-Studies", "Hong Kong University of Science and Technology", "中国香港", "lavender"],
  ["tokyo", "https://www.u-tokyo.ac.jp/en/prospective-students/graduate_course_students.html", "University of Tokyo", "日本", "blue"],
  ["kyoto", "https://www.kyoto-u.ac.jp/en/education-campus/education-and-admissions/graduate-degree-programs", "Kyoto University", "日本", "blue"],
  ["kaist", "https://admission.kaist.ac.kr/intl-graduate/", "KAIST", "韩国", "blue"],
] as const;

const ADDITIONAL_UNIVERSITY_SEEDS: readonly CrawlSeed[] = ADDITIONAL_UNIVERSITY_PAGES.map(
  ([id, url, label, country, accent]) => ({
    id: `${id}-admissions`,
    url,
    label,
    country,
    type: "university",
    accent,
    tags: [label, "申请信息", "院校官网"],
  }),
);

const SEEDS: readonly CrawlSeed[] = [
  {
    id: "canada-designated-learning-institutions",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html",
    label: "Immigration, Refugees and Citizenship Canada",
    country: "加拿大",
    type: "university",
    accent: "sage",
    tags: ["DLI", "院校名单", "Canada.ca"],
  },
  {
    id: "japan-school-and-programme-search",
    url: "https://studyinjapan.go.jp/en/search-for-schools/school_search.php?lang=en",
    label: "Study in Japan",
    country: "日本",
    type: "major",
    accent: "blue",
    tags: ["学校检索", "专业方向", "日本"],
  },
  {
    id: "japan-scholarships",
    url: "https://www.studyinjapan.go.jp/en/search-for-scholarships/tuition-reduction_search.php?lang=en",
    label: "Study in Japan",
    country: "日本",
    type: "scholarship",
    accent: "blue",
    tags: ["奖学金", "学费减免", "日本"],
  },
  {
    id: "australia-financial-assistance",
    url: "https://www.education.gov.au/international-education/financial-assistance-international-students",
    label: "Australian Department of Education",
    country: "澳大利亚",
    type: "scholarship",
    accent: "sun",
    tags: ["奖学金", "资助", "澳大利亚政府"],
  },
  {
    id: "canada-study-permit",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html",
    label: "Immigration, Refugees and Citizenship Canada",
    country: "加拿大",
    type: "policy",
    accent: "sage",
    tags: ["学习许可", "签证", "Canada.ca"],
  },
  {
    id: "canada-scholarships",
    url: "https://www.canada.ca/en/services/benefits/education/student-aid/scholarships.html",
    label: "Government of Canada",
    country: "加拿大",
    type: "scholarship",
    accent: "sage",
    tags: ["奖学金", "资助", "Canada.ca"],
  },
  {
    id: "singapore-student-pass",
    url: "https://www.ica.gov.sg/reside/STP/",
    label: "Singapore Immigration & Checkpoints Authority",
    country: "新加坡",
    type: "policy",
    accent: "lavender",
    tags: ["Student's Pass", "签证", "ICA"],
  },
  {
    id: "mit-graduate-admissions",
    url: "https://facts.mit.edu/graduate-student-admission/",
    label: "MIT Institutional Research",
    country: "美国",
    type: "university",
    accent: "ink",
    tags: ["MIT", "研究生申请", "院校官网"],
  },
  {
    id: "stanford-graduate-admissions",
    url: "https://gradadmissions.stanford.edu/apply",
    label: "Stanford Graduate Admissions",
    country: "美国",
    type: "university",
    accent: "ink",
    tags: ["Stanford", "研究生申请", "院校官网"],
  },
  {
    id: "harvard-admissions",
    url: "https://www.harvard.edu/admissions-aid/",
    label: "Harvard University",
    country: "美国",
    type: "university",
    accent: "ink",
    tags: ["Harvard", "申请与资助", "院校官网"],
  },
  {
    id: "berkeley-graduate-admissions",
    url: "https://grad.berkeley.edu/admissions/",
    label: "UC Berkeley Graduate Division",
    country: "美国",
    type: "university",
    accent: "ink",
    tags: ["UC Berkeley", "研究生申请", "院校官网"],
  },
  {
    id: "princeton-graduate-admissions",
    url: "https://admission.princeton.edu/apply",
    label: "Princeton Admission",
    country: "美国",
    type: "university",
    accent: "ink",
    tags: ["Princeton", "本科申请", "院校官网"],
  },
  {
    id: "yale-admissions",
    url: "https://www.yale.edu/admissions",
    label: "Yale University",
    country: "美国",
    type: "university",
    accent: "ink",
    tags: ["Yale", "申请与资助", "院校官网"],
  },
  {
    id: "oxford-graduate-admissions",
    url: "https://www.ox.ac.uk/admissions/graduate",
    label: "University of Oxford",
    country: "英国",
    type: "university",
    accent: "coral",
    tags: ["Oxford", "研究生申请", "院校官网"],
  },
  {
    id: "cambridge-postgraduate-apply",
    url: "https://www.postgraduate.study.cam.ac.uk/apply",
    label: "University of Cambridge",
    country: "英国",
    type: "university",
    accent: "coral",
    tags: ["Cambridge", "研究生申请", "院校官网"],
  },
  {
    id: "imperial-postgraduate-admissions",
    url: "https://www.imperial.ac.uk/study/help-centre/postgraduate-admissions/how-do-i-apply-for-postgraduate-study.php",
    label: "Imperial College London",
    country: "英国",
    type: "university",
    accent: "coral",
    tags: ["Imperial", "研究生申请", "院校官网"],
  },
  {
    id: "ucl-graduate-apply",
    url: "https://www.ucl.ac.uk/study/prospective-students/graduate/how-apply",
    label: "University College London",
    country: "英国",
    type: "university",
    accent: "coral",
    tags: ["UCL", "研究生申请", "院校官网"],
  },
  ...ADDITIONAL_UNIVERSITY_SEEDS,
] as const;

for (const seed of SEEDS) ALLOWED_HOSTS.add(new URL(seed.url).hostname);

export type CrawledPage = {
  id: string;
  url: string;
  sourceLabel: string;
  country: string;
  type: InsightType;
  accent: string;
  tags: string[];
  title: string;
  description: string;
  sections: string[];
  crawledAt: string;
  contentHash: string;
};

export type CrawlSnapshot = {
  version: 2;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  pages: CrawledPage[];
  errors: Array<{ sourceId: string; code: string }>;
};

export async function readCuratedCrawlSnapshot(): Promise<CrawlSnapshot | null> {
  return getCacheProvider().get<CrawlSnapshot>(CURATED_CRAWL_CACHE_KEY);
}

export async function refreshCuratedSources(config: RuntimeConfig): Promise<CrawlSnapshot | null> {
  if (!config.crawlerEnabled) return readCuratedCrawlSnapshot();
  const cache = getCacheProvider();
  const existing = await cache.get<CrawlSnapshot>(CURATED_CRAWL_CACHE_KEY);
  const now = Date.now();
  const lastAttempt = existing?.lastAttemptAt ? Date.parse(existing.lastAttemptAt) : 0;
  if (Number.isFinite(lastAttempt) && now - lastAttempt < config.crawlerIntervalSeconds * 1000) {
    return existing;
  }

  const pages = new Map((existing?.pages ?? []).map((page) => [page.id, page]));
  const errors: CrawlSnapshot["errors"] = [];
  const robotsCache = new Map<string, Promise<{ allowed: boolean; code: string }>>();
  let successes = 0;
  const selectedSeeds = SEEDS.slice(0, config.crawlerMaxPages);
  for (let offset = 0; offset < selectedSeeds.length; offset += CRAWL_CONCURRENCY) {
    const batch = selectedSeeds.slice(offset, offset + CRAWL_CONCURRENCY);
    const results = await Promise.all(batch.map(async (seed) => crawlSeed(seed, config, robotsCache)));
    for (const result of results) {
      if (result.page) {
        pages.set(result.seed.id, result.page);
        successes += 1;
      } else {
        if (result.removeRetained) pages.delete(result.seed.id);
        errors.push({ sourceId: result.seed.id, code: result.code });
      }
    }
  }

  const snapshot: CrawlSnapshot = {
    version: 2,
    lastAttemptAt: new Date(now).toISOString(),
    lastSuccessAt: successes > 0 ? new Date(now).toISOString() : existing?.lastSuccessAt ?? null,
    pages: [...pages.values()],
    errors,
  };
  await cache.set(CURATED_CRAWL_CACHE_KEY, snapshot, RETENTION_SECONDS);
  logInfo("curated_crawl_completed", {
    attempted: Math.min(SEEDS.length, config.crawlerMaxPages),
    succeeded: successes,
    retained: snapshot.pages.length,
    failed: errors.length,
  });
  return snapshot;
}

async function crawlSeed(
  seed: CrawlSeed,
  config: RuntimeConfig,
  robotsCache: Map<string, Promise<{ allowed: boolean; code: string }>>,
): Promise<{ seed: CrawlSeed; page: CrawledPage | null; code: string; removeRetained: boolean }> {
  try {
    const origin = new URL(seed.url).origin;
    const permissionPromise = robotsCache.get(origin) ?? robotsPermission(seed.url, config);
    robotsCache.set(origin, permissionPromise);
    const permission = await permissionPromise;
    if (!permission.allowed) {
      return { seed, page: null, code: permission.code, removeRetained: true };
    }
    const html = await fetchHtml(seed.url, config);
    return {
      seed,
      page: await extractPage(seed, html, new Date().toISOString()),
      code: "OK",
      removeRetained: false,
    };
  } catch (error) {
    return { seed, page: null, code: publicCrawlerErrorCode(error), removeRetained: false };
  }
}

export function crawledPagesToInsights(snapshot: CrawlSnapshot | null): Insight[] {
  if (!snapshot) return [];
  return snapshot.pages.map((page) => ({
    id: `crawl-${page.id}`,
    type: page.type,
    icon: page.type === "scholarship" ? "✹" : page.type === "major" ? "⌁" : "↗",
    title: page.title,
    summary: page.description,
    country: page.country,
    meta: `${typeLabel(page.type)} · ${page.sourceLabel}`,
    updated: page.crawledAt.slice(0, 10),
    tags: page.tags,
    accent: page.accent,
    detail: page.sections.length > 0
      ? page.sections
      : ["已从公开官方页面采集摘要；请打开来源页面核对完整条件和截止日期。"],
    sourceLabel: page.sourceLabel,
    sourceUrl: page.url,
  }));
}

function typeLabel(type: InsightType): string {
  if (type === "major") return "课程与申请信息";
  if (type === "scholarship") return "奖学金与资助";
  return "政府政策";
}

async function robotsPermission(target: string, config: RuntimeConfig): Promise<{ allowed: boolean; code: string }> {
  const url = new URL(target);
  const robotsUrl = new URL("/robots.txt", url.origin);
  let response: Response;
  try {
    response = await fetchWithRetry(robotsUrl, config, "text/plain,text/*;q=0.9");
  } catch (error) {
    logWarn("crawler_robots_unavailable", { hostname: url.hostname, code: publicCrawlerErrorCode(error) });
    return { allowed: false, code: "ROBOTS_UNAVAILABLE" };
  }
  if (response.status === 404 || response.status === 410) return { allowed: true, code: "ROBOTS_NOT_FOUND" };
  if (!response.ok) return { allowed: false, code: `ROBOTS_HTTP_${response.status}` };
  const body = await readLimitedText(response, Math.min(config.crawlerMaxBytes, 262144));
  return isPathAllowed(body, `${url.pathname}${url.search}`, "QichengStudyBot")
    ? { allowed: true, code: "ROBOTS_ALLOWED" }
    : { allowed: false, code: "ROBOTS_DENIED" };
}

async function fetchHtml(target: string, config: RuntimeConfig): Promise<string> {
  const url = new URL(target);
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error("HOST_NOT_ALLOWLISTED");
  const response = await fetchWithRetry(url, config, "text/html,application/xhtml+xml;q=0.9");
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("UNSUPPORTED_CONTENT_TYPE");
  }
  return readLimitedText(response, config.crawlerMaxBytes);
}

async function fetchWithRetry(url: URL, config: RuntimeConfig, accept: string): Promise<Response> {
  const attempts = Math.min(config.dataProviderRetryCount + 1, 2);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchFollowingAllowedRedirects(url, config, accept);
      if (response.ok || response.status === 404 || response.status === 410) return response;
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`HTTP_${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("FETCH_FAILED");
}

async function fetchFollowingAllowedRedirects(
  initialUrl: URL,
  config: RuntimeConfig,
  accept: string,
): Promise<Response> {
  let current = initialUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (current.protocol !== "https:" || !ALLOWED_HOSTS.has(current.hostname)) {
      throw new Error("HOST_NOT_ALLOWLISTED");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.dataProviderTimeoutMs);
    try {
      const response = await fetch(current, {
        headers: { Accept: accept, "User-Agent": CRAWLER_USER_AGENT },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, current);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new Error("PAGE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("PAGE_TOO_LARGE");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function extractPage(seed: CrawlSeed, html: string, crawledAt: string): CrawledPage {
  const withoutNoise = html
    .replace(/<(script|style|noscript|svg|nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const title = cleanText(matchFirst(withoutNoise, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
    || matchFirst(withoutNoise, /<title[^>]*>([\s\S]*?)<\/title>/i)
    || seed.label).slice(0, 180);
  const metaDescription = extractMetaDescription(withoutNoise);
  const contentRoot = matchFirst(withoutNoise, /<main[^>]*>([\s\S]*?)<\/main>/i)
    || matchFirst(withoutNoise, /<article[^>]*>([\s\S]*?)<\/article>/i)
    || withoutNoise;
  const blocks = [...contentRoot.matchAll(/<(h2|h3|p|li|div)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => cleanText(match[2]))
    .filter((value) => value.length >= 40 && value.length <= 700)
    .filter((value, index, all) => all.indexOf(value) === index);
  const description = (metaDescription || blocks[0] || "官方页面已采集，详细信息请查看来源。").slice(0, 320);
  const sections = blocks.filter((value) => value !== description).slice(0, 4).map((value) => value.slice(0, 600));
  if (title.length < 3 || (description.length < 20 && sections.length === 0)) throw new Error("CONTENT_NOT_EXTRACTABLE");
  return {
    id: seed.id,
    url: seed.url,
    sourceLabel: seed.label,
    country: seed.country,
    type: seed.type,
    accent: seed.accent,
    tags: seed.tags,
    title,
    description,
    sections,
    crawledAt,
    contentHash: simpleHash(`${title}\n${description}\n${sections.join("\n")}`),
  };
}

function extractMetaDescription(html: string): string {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([\s\S]*?)["']/i)?.[1];
    if (content) return cleanText(content);
  }
  return "";
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1]?.toLowerCase() === "x";
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function matchFirst(value: string, pattern: RegExp): string {
  return value.match(pattern)?.[1] ?? "";
}

export function isPathAllowed(robots: string, path: string, userAgent: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current = { agents: [] as string[], rules: [] as Array<{ allow: boolean; path: string }> };
  const push = () => {
    if (current.agents.length > 0) groups.push(current);
    current = { agents: [], rules: [] };
  };
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (current.rules.length > 0) push();
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current.agents.length > 0 && value) {
      current.rules.push({ allow: key === "allow", path: value });
    }
  }
  push();
  const normalizedAgent = userAgent.toLowerCase();
  const exact = groups.filter((group) => group.agents.some((agent) => normalizedAgent.includes(agent) && agent !== "*"));
  const applicable = exact.length > 0 ? exact : groups.filter((group) => group.agents.includes("*"));
  const rules = applicable.flatMap((group) => group.rules).filter((rule) => robotsPathMatches(rule.path, path));
  if (rules.length === 0) return true;
  rules.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return rules[0].allow;
}

function robotsPathMatches(rule: string, path: string): boolean {
  const endAnchored = rule.endsWith("$");
  const body = (endAnchored ? rule.slice(0, -1) : rule)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${body}${endAnchored ? "$" : ""}`).test(path);
}

function publicCrawlerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (/PAGE_TOO_LARGE/.test(message)) return "PAGE_TOO_LARGE";
  if (/UNSUPPORTED_CONTENT_TYPE/.test(message)) return "UNSUPPORTED_CONTENT_TYPE";
  if (/CONTENT_NOT_EXTRACTABLE/.test(message)) return "CONTENT_NOT_EXTRACTABLE";
  if (/HOST_NOT_ALLOWLISTED/.test(message)) return "HOST_NOT_ALLOWLISTED";
  if (/HTTP_\d+/.test(message)) return message.match(/HTTP_\d+/)?.[0] ?? "HTTP_ERROR";
  if (error instanceof DOMException && error.name === "AbortError") return "TIMEOUT";
  return "FETCH_FAILED";
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
