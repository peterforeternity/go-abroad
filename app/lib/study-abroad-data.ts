export type InsightType =
  | "policy"
  | "university"
  | "major"
  | "scholarship";

export type Destination = {
  id: string;
  country: string;
  flag: string;
  region: string;
  cities: string;
  headline: string;
  description: string;
  stat: string;
  statLabel: string;
  color: string;
  trend: string;
  trendTone: "up" | "steady";
  tags: string[];
};

export type Insight = {
  id: string;
  type: InsightType;
  icon: string;
  title: string;
  summary: string;
  country: string;
  meta: string;
  updated: string;
  tags: string[];
  accent: string;
  detail: string[];
  sourceLabel?: string;
  sourceUrl?: string;
};

export type StudyAbroadPayload = {
  meta: {
    version: string;
    dataVersion: string;
    source: string;
    freshness: string;
    lastSynced: string | null;
    lastSyncedAt: string | null;
    isStale: boolean;
    isDemo: boolean;
    generatedAt: string;
    cacheTtlSeconds: number;
    cacheHit?: boolean;
    sources?: Array<{
      id: string;
      label: string;
      url: string;
      status: "ok" | "unavailable";
    }>;
  };
  stats: Array<{ value: string; label: string }>;
  destinations: Destination[];
  insights: Insight[];
};

const STATIC_META = {
  version: "demo-2026.07.14.01",
  dataVersion: "demo-2026.07.14.01",
  source: "demo",
  freshness: "演示数据，仅用于开发验证",
  lastSynced: null,
  lastSyncedAt: null,
  isStale: true,
  isDemo: true,
  generatedAt: "2026-07-14T10:32:00+08:00",
  cacheTtlSeconds: 300,
};

const STATS: StudyAbroadPayload["stats"] = [
  { value: "46", label: "覆盖国家" },
  { value: "1,842", label: "院校档案" },
  { value: "3,120", label: "奖学金机会" },
];

const DESTINATIONS: Destination[] = [
  {
    id: "uk",
    country: "英国",
    flag: "🇬🇧",
    region: "Europe / 欧洲",
    cities: "伦敦 · 曼彻斯特 · 爱丁堡",
    headline: "一年制硕士，快速进入全球职场",
    description: "商科、传媒与艺术方向选择密度高，适合想快速完成学位的同学。",
    stat: "9,640",
    statLabel: "个项目在库",
    color: "coral",
    trend: "+18%",
    trendTone: "up",
    tags: ["一年制", "PSW 工签"],
  },
  {
    id: "us",
    country: "美国",
    flag: "🇺🇸",
    region: "North America / 北美",
    cities: "纽约 · 波士顿 · 加州湾区",
    headline: "用研究与实习，打开更多可能",
    description: "STEM、计算机与商业分析项目资源丰富，适合目标明确的长期规划。",
    stat: "12,480",
    statLabel: "个项目在库",
    color: "ink",
    trend: "+11%",
    trendTone: "up",
    tags: ["STEM", "实习机会"],
  },
  {
    id: "australia",
    country: "澳大利亚",
    flag: "🇦🇺",
    region: "Oceania / 大洋洲",
    cities: "墨尔本 · 悉尼 · 布里斯班",
    headline: "把生活质量，也放进选择标准",
    description: "课程实践性强、生活节奏舒适，商科、工程和护理方向持续热门。",
    stat: "7,210",
    statLabel: "个项目在库",
    color: "sun",
    trend: "+9%",
    trendTone: "steady",
    tags: ["高性价比", "工作权利"],
  },
  {
    id: "canada",
    country: "加拿大",
    flag: "🇨🇦",
    region: "North America / 北美",
    cities: "多伦多 · 温哥华 · 蒙特利尔",
    headline: "在更大的世界里，找到自己的节奏",
    description: "移民友好、专业选择多，适合把长期生活与留学规划一起考虑。",
    stat: "6,870",
    statLabel: "个项目在库",
    color: "sage",
    trend: "+7%",
    trendTone: "steady",
    tags: ["Co-op", "毕业工签"],
  },
  {
    id: "singapore",
    country: "新加坡",
    flag: "🇸🇬",
    region: "Asia / 亚洲",
    cities: "新加坡 · one-north · 滨海湾",
    headline: "离家近一点，和世界接轨快一点",
    description: "亚洲金融与科技中心，适合追求国际化职业起点的申请者。",
    stat: "1,280",
    statLabel: "个项目在库",
    color: "lavender",
    trend: "+15%",
    trendTone: "up",
    tags: ["亚洲枢纽", "奖学金多"],
  },
  {
    id: "japan",
    country: "日本",
    flag: "🇯🇵",
    region: "Asia / 亚洲",
    cities: "东京 · 京都 · 大阪",
    headline: "从一个熟悉的文化，走向更深的专注",
    description: "理工、设计和传媒方向值得关注，日语项目与英文项目均有覆盖。",
    stat: "2,410",
    statLabel: "个项目在库",
    color: "blue",
    trend: "+13%",
    trendTone: "up",
    tags: ["工科强", "文化友好"],
  },
];

const INSIGHTS: Insight[] = [
  {
    id: "uk-graduate-route",
    type: "policy",
    icon: "↗",
    title: "英国 Graduate Route：毕业后还能留下多久？",
    summary: "最新政策时间线、签证成本与适合人群，一次看懂。",
    country: "英国",
    meta: "政策解读 · 6 min",
    updated: "今天 10:32",
    tags: ["签证", "PSW", "英国"],
    accent: "coral",
    detail: [
      "Graduate Route 通常允许完成学位的国际学生在英国继续工作或求职。",
      "建议将签证有效期、目标行业招聘节奏和雇主担保可能性放在同一张时间表里评估。",
      "页面展示的是决策摘要，正式申请前请以 GOV.UK 最新公告为准。",
    ],
  },
  {
    id: "nus-business-analytics",
    type: "university",
    icon: "✦",
    title: "NUS 商业分析｜把数据变成下一步行动",
    summary: "项目强度、课程结构与就业方向，适合谁一页拆解。",
    country: "新加坡",
    meta: "院校档案 · 8 min",
    updated: "昨天 18:20",
    tags: ["商科", "NUS", "就业"],
    accent: "lavender",
    detail: [
      "项目适合希望在商业问题与数据方法之间建立连接的申请者。",
      "申请准备可优先补齐统计基础、项目经历和一份能说明问题意识的个人陈述。",
      "课程和申请要求会按学年更新，请在收藏后留意同步提醒。",
    ],
  },
  {
    id: "ai-product-design",
    type: "major",
    icon: "⌁",
    title: "AI 产品设计，正在成为下一条主航道",
    summary: "从专业课程到作品集，拆解跨学科申请的准备方式。",
    country: "美国",
    meta: "专业趋势 · 7 min",
    updated: "昨天 15:08",
    tags: ["AI", "设计", "跨学科"],
    accent: "ink",
    detail: [
      "新型项目通常同时关注用户研究、产品策略、数据意识和原型表达。",
      "没有纯设计或纯工程背景也可以申请，但需要用项目说明你的协作与落地能力。",
      "作品集不在于数量，而在于是否能讲清楚问题、选择和结果。",
    ],
  },
  {
    id: "erasmus-mundus",
    type: "scholarship",
    icon: "✹",
    title: "Erasmus Mundus｜把奖学金放进申请计划",
    summary: "项目筛选、时间节点和材料策略，提前 6 个月开始更从容。",
    country: "欧洲",
    meta: "奖学金机会 · 5 min",
    updated: "07-13 09:45",
    tags: ["奖学金", "欧洲", "全额资助"],
    accent: "sun",
    detail: [
      "联合硕士项目通常需要同时关注项目匹配度、学术背景和跨文化协作经历。",
      "推荐把动机信拆成项目契合、个人证据和未来计划三段，再反复压缩表达。",
      "不同项目的截止日期差异较大，收藏后可以按时间线管理。",
    ],
  },
  {
    id: "canada-coop",
    type: "university",
    icon: "◎",
    title: "加拿大 Co-op 项目：先把职业体验放进课程",
    summary: "看懂课程型硕士的实习结构、就业节点与筛选逻辑。",
    country: "加拿大",
    meta: "院校档案 · 6 min",
    updated: "07-12 16:11",
    tags: ["Co-op", "加拿大", "实习"],
    accent: "sage",
    detail: [
      "Co-op 的价值在于把课堂知识与真实岗位连接起来，但并不等同于就业保证。",
      "申请时需要提前确认实习学期、课程负担和是否允许国际学生参与。",
      "如果你的目标是转行，优先挑选有真实项目产出和雇主合作的课程。",
    ],
  },
  {
    id: "australia-scholarship",
    type: "scholarship",
    icon: "◇",
    title: "澳洲院校奖学金：别只盯着全额资助",
    summary: "学费减免、院系奖学金和入学奖的区别，申请逻辑不一样。",
    country: "澳大利亚",
    meta: "奖学金机会 · 4 min",
    updated: "07-11 12:00",
    tags: ["奖学金", "澳洲", "学费"],
    accent: "blue",
    detail: [
      "自动评估的入学奖、学院奖学金和外部资助通常有不同的申请窗口。",
      "建议在比较总成本时，把奖学金覆盖范围、续期条件和生活费一起列入。",
      "早申和保持材料完整，通常比单纯追求最高金额更重要。",
    ],
  },
];

export const STUDY_ABROAD_FALLBACK: StudyAbroadPayload = {
  meta: STATIC_META,
  stats: STATS,
  destinations: DESTINATIONS,
  insights: INSIGHTS,
};

const CACHE_TTL_MS = STATIC_META.cacheTtlSeconds * 1000;
let cachedPayload: StudyAbroadPayload | null = null;
let cacheExpiresAt = 0;

export function getStudyAbroadPayload(): StudyAbroadPayload {
  const now = Date.now();
  const cacheHit = Boolean(cachedPayload && now < cacheExpiresAt);

  if (!cachedPayload || !cacheHit) {
    cachedPayload = {
      ...STUDY_ABROAD_FALLBACK,
      meta: {
        ...STUDY_ABROAD_FALLBACK.meta,
        generatedAt: new Date(now).toISOString(),
      },
    };
    cacheExpiresAt = now + CACHE_TTL_MS;
  }

  return {
    ...cachedPayload,
    meta: {
      ...cachedPayload.meta,
      cacheHit,
    },
  };
}
