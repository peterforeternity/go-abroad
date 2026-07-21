"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type Destination,
  type Insight,
  type InsightType,
  type StudyAbroadPayload,
} from "./lib/study-abroad-data";

type AuthMode = "login" | "signup" | "reset" | "reset-confirm";
type ModalType = "auth" | "assessment" | null;
type StudyDataState = "loading" | "ready" | "degraded" | "unconfigured" | "error";
type HealthState = "loading" | "ready" | "degraded" | "unknown";

const TYPE_LABELS: Record<InsightType | "all", string> = {
  all: "全部",
  policy: "政策",
  university: "院校",
  major: "专业",
  scholarship: "奖学金",
};

const HERO_PILLS = ["英国", "美国", "商科", "奖学金", "申请时间线"];

type StudyDataApiBody = {
  ok?: boolean;
  data?: StudyAbroadPayload;
  error?: { code?: string; message?: string };
};

type HealthPayload = {
  status: "ok" | "degraded";
  ready: boolean;
  environment: "development" | "staging" | "production";
  checks: {
    configuration: boolean;
    database: boolean;
    studyDataProvider: boolean;
    demoData: boolean;
    authentication: boolean;
    email: boolean;
  };
  issueKeys: string[];
  generatedAt: string;
};

type HealthApiBody = {
  ok?: boolean;
  data?: HealthPayload;
};

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};

type AuthApiBody = {
  ok?: boolean;
  data?: AuthUser | { message?: string };
  error?: { code?: string; message?: string };
};

function unwrapStudyData(body: StudyDataApiBody): StudyAbroadPayload | null {
  return body.ok === true && body.data ? body.data : null;
}

function formatSyncLabel(meta: StudyAbroadPayload["meta"] | null): string {
  if (!meta) return "未配置";
  if (meta.isDemo) return "开发演示";
  if (!meta.lastSyncedAt) return "未同步";
  return `${meta.lastSyncedAt.slice(11, 16)} 更新`;
}

function formatLastSynced(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "暂无同步时间";
  const timestamp = new Date(lastSyncedAt);
  if (Number.isNaN(timestamp.getTime())) return "同步时间未知";
  return `最后同步 ${timestamp.toLocaleString("zh-CN", { hour12: false })}`;
}

function isLivePayload(data: StudyAbroadPayload | null, state: StudyDataState): boolean {
  return Boolean(
    data &&
    state === "ready" &&
    !data.meta.isDemo &&
    !data.meta.isStale &&
    data.meta.source &&
    data.meta.lastSyncedAt,
  );
}

function dataStateCopy(state: StudyDataState): { title: string; description: string } {
  if (state === "loading") {
    return { title: "正在检查数据服务", description: "页面可继续浏览，真实数据加载完成后会自动显示。" };
  }
  if (state === "unconfigured") {
    return { title: "真实数据服务尚未配置", description: "当前为受限测试环境，暂不展示院校、政策、专业或奖学金数据。" };
  }
  if (state === "degraded") {
    return { title: "数据可能已过期", description: "当前展示上次成功同步的数据，请结合最后同步时间判断。" };
  }
  return { title: "数据状态未知", description: "数据服务暂时无法响应，请稍后重试或联系管理员。" };
}

function healthStateCopy(state: HealthState): string {
  if (state === "ready") return "系统可用";
  if (state === "degraded") return "部分服务未配置";
  if (state === "loading") return "正在检查服务状态";
  return "状态未知";
}

export default function Home() {
  const [data, setData] = useState<StudyAbroadPayload | null>(null);
  const [dataState, setDataState] = useState<StudyDataState>("loading");
  const [dataMessage, setDataMessage] = useState("正在连接真实数据服务");
  const [healthState, setHealthState] = useState<HealthState>("loading");
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<InsightType | "all">(
    "all",
  );
  const [selectedCountry, setSelectedCountry] = useState("全部国家");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [assessmentStep, setAssessmentStep] = useState(0);
  const [assessmentAnswers, setAssessmentAnswers] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState("");
  const [activeNav, setActiveNav] = useState("探索目的地");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resetToken, setResetToken] = useState("");

  const showToast = (message: string) => setToast(message);
  const openAuth = (mode: AuthMode = "login") => {
    setAuthMode(mode);
    setModal("auth");
  };

  useEffect(() => {
    let cancelled = false;

    fetch("/api/study-abroad", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const body = (await response.json()) as StudyDataApiBody;
        if (!response.ok) {
          const unconfiguredCodes = new Set([
            "CONFIGURATION_ERROR",
            "DATA_PROVIDER_NOT_CONFIGURED",
            "DEMO_PROVIDER_DISABLED",
          ]);
          if (!cancelled) {
            setData(null);
            setDataState(unconfiguredCodes.has(body.error?.code ?? "") ? "unconfigured" : "error");
            setDataMessage(
              unconfiguredCodes.has(body.error?.code ?? "")
                ? "真实数据服务尚未配置"
                : body.error?.message ?? "数据服务暂时不可用",
            );
          }
          return null;
        }
        const nextData = unwrapStudyData(body);
        if (!nextData) throw new Error("invalid-data-response");
        return nextData;
      })
      .then((nextData: StudyAbroadPayload | null) => {
        if (!cancelled && nextData) {
          setData(nextData);
          setDataState(nextData.meta.isStale ? "degraded" : "ready");
          setDataMessage(
            nextData.meta.isDemo
              ? "演示数据，仅用于开发验证"
              : nextData.meta.isStale
                ? "数据可能已过期"
                : "数据服务可用",
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setDataState("error");
          setDataMessage("数据状态未知");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (response.status === 401) return null;
        const body = (await response.json()) as AuthApiBody;
        if (!response.ok || body.ok !== true || !body.data || !("email" in body.data)) return null;
        return body.data as AuthUser;
      })
      .then((user) => {
        if (!cancelled) setAuthUser(user);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const verificationToken = url.searchParams.get("verify_token");
    const passwordResetToken = url.searchParams.get("reset_token");
    if (verificationToken) {
      fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verificationToken }),
      })
        .then(async (response) => {
          const body = (await response.json()) as AuthApiBody;
          if (!response.ok) throw new Error(body.error?.message ?? "邮箱验证失败");
          showToast("邮箱验证成功 · 现在可以登录");
          openAuth("login");
        })
        .catch((error) => showToast(error instanceof Error ? error.message : "邮箱验证失败"));
    } else if (passwordResetToken) {
      window.setTimeout(() => {
        setResetToken(passwordResetToken);
        openAuth("reset-confirm");
      }, 0);
    }
    if (verificationToken || passwordResetToken) {
      url.searchParams.delete("verify_token");
      url.searchParams.delete("reset_token");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/health", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("health-request-failed");
        const body = (await response.json()) as HealthApiBody;
        if (body.ok !== true || !body.data) throw new Error("invalid-health-response");
        return body.data;
      })
      .then((health) => {
        if (!cancelled) {
          setHealthState(health.ready ? "ready" : health.status === "degraded" ? "degraded" : "unknown");
        }
      })
      .catch(() => {
        if (!cancelled) setHealthState("unknown");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleInsights = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return (data?.insights ?? []).filter((item) => {
      const matchesType = selectedType === "all" || item.type === selectedType;
      const matchesCountry =
        selectedCountry === "全部国家" || item.country === selectedCountry;
      const haystack = [
        item.title,
        item.summary,
        item.country,
        item.meta,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);

      return matchesType && matchesCountry && matchesQuery;
    });
  }, [data, query, selectedCountry, selectedType]);

  const insightDistribution = useMemo(() => {
    const total = data?.insights.length ?? 0;
    return (Object.keys(TYPE_LABELS) as InsightType[]).map((type) => {
      const count = data?.insights.filter((item) => item.type === type).length ?? 0;
      return { type, count, percent: total ? Math.max(6, Math.round((count / total) * 100)) : 0 };
    });
  }, [data]);

  const sourceCount = data?.meta.sources?.filter((source) => source.status === "ok").length ?? 0;
  const countryCount = new Set(data?.insights.map((item) => item.country) ?? []).size;

  const liveData = isLivePayload(data, dataState);
  const dataCopy = dataStateCopy(dataState);
  const primaryDestination = data?.destinations[0] ?? null;
  const primaryInsight = data?.insights[0] ?? null;
  const controlsDisabled = !data || dataState === "loading" || dataState === "unconfigured" || dataState === "error";

  const scrollTo = (id: string, label?: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    if (label) setActiveNav(label);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const syncResponse = await fetch("/api/study-abroad/sync", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const syncBody = (await syncResponse.json()) as StudyDataApiBody;
      if (!syncResponse.ok || syncBody.ok !== true) {
        throw new Error(syncBody.error?.message ?? "sync-failed");
      }

      const dataResponse = await fetch("/api/study-abroad", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!dataResponse.ok) throw new Error("refresh-failed");
      const nextData = unwrapStudyData((await dataResponse.json()) as StudyDataApiBody);
      if (!nextData) throw new Error("invalid-data-response");
      setData(nextData);
      setDataState(nextData.meta.isStale ? "degraded" : "ready");
      setDataMessage(
        nextData.meta.isDemo
          ? "演示数据，仅用于开发验证"
          : nextData.meta.isStale
            ? "数据可能已过期"
            : "数据服务可用",
      );
      showToast("数据已同步 · 结果已写入缓存");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "同步失败，请稍后重试");
    } finally {
      setSyncing(false);
    }
  };

  const toggleSaved = (id: string) => {
    setSavedIds((current) => {
      const isSaved = current.includes(id);
      showToast(isSaved ? "已从我的清单移除" : "已保存到我的清单");
      return isSaved ? current.filter((savedId) => savedId !== id) : [...current, id];
    });
  };

  const chooseDestination = (destination: Destination) => {
    setSelectedCountry(destination.country);
    setSelectedType("all");
    scrollTo("insights", "申请信息");
    showToast(`已切换到 ${destination.country} · 为你筛选相关信息`);
  };

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("退出失败");
      setAuthUser(null);
      showToast("已安全退出");
    } catch {
      showToast("暂时无法退出，请稍后重试");
    }
  };

  const resetAssessment = () => {
    setAssessmentStep(0);
    setAssessmentAnswers([]);
  };

  const openAssessment = () => {
    resetAssessment();
    setModal("assessment");
  };

  return (
    <main className="app-shell">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <button className="brand" onClick={() => scrollTo("top")} aria-label="回到首页">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          <span>
            启程
            <small>STUDY ABROAD</small>
          </span>
        </button>

        <nav className="desktop-nav" aria-label="主导航">
          {[
            ["探索目的地", "explore"],
            ["申请信息", "insights"],
            ["规划工具", "planning"],
          ].map(([label, id]) => (
            <button
              className={activeNav === label ? "nav-link active" : "nav-link"}
              key={label}
              onClick={() => scrollTo(id, label)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <button
            className="icon-button"
            aria-label="聚焦搜索"
            onClick={() => {
              scrollTo("explore");
              window.setTimeout(() => document.getElementById("global-search")?.focus(), 450);
            }}
          >
            ⌕
          </button>
          {authUser ? (
            <button className="signin-button" onClick={handleLogout} title="点击安全退出">
              {authUser.displayName || authUser.email} <span>↗</span>
            </button>
          ) : (
            <button className="signin-button" disabled={authLoading} onClick={() => openAuth("login")}>
              {authLoading ? "检查登录状态" : "登录 / 注册"} <span>↗</span>
            </button>
          )}
        </div>
      </header>

      <section className="hero section-container" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            为中国学生打造的留学决策工作台
          </div>
          <h1>
            把留学这件事，
            <br />
            <em>变成一张清晰的路线图。</em>
          </h1>
          <p className="hero-description">
            政策、院校、专业与奖学金，集中在一个清晰的空间。先确认数据状态，再比较并做出适合你的决定。
          </p>
          <div className="hero-actions">
            <button className="button-primary" onClick={() => scrollTo("explore", "探索目的地")}>
              开始探索 <span>↗</span>
            </button>
            <button className="button-quiet" onClick={openAssessment}>
              <span className="play-dot">▶</span> 5 分钟快速评估
            </button>
          </div>
          <div className="hero-proof">
            <div>
              <strong>STAGING</strong>
              <span>当前为受限测试环境</span>
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-label="留学申请路线概览">
          <div className="hero-visual-header">
            <span>数据服务状态</span>
            <span className={`live-badge ${liveData ? "live" : data?.meta.isDemo ? "demo" : dataState === "degraded" ? "caution" : "restricted"}`}>
              <i /> {liveData ? "LIVE DATA" : data?.meta.isDemo ? "演示数据" : dataState === "degraded" ? "数据可能已过期" : "受限测试环境"}
            </span>
          </div>
          <div className="orbit-stage">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit-dot dot-one" />
            <div className="orbit-dot dot-two" />
            <div className="orbit-dot dot-three" />
            <div className="orbit-core">
              <span>{primaryDestination ? primaryDestination.flag : "STAGING"}</span>
              <strong>{primaryDestination?.country ?? dataCopy.title}</strong>
              <small>{primaryDestination ? `${primaryDestination.stat} ${primaryDestination.statLabel}` : "当前为受限测试环境"}</small>
            </div>
            {primaryDestination && (
              <div className="floating-card floating-card-top">
                <span className="mini-icon mini-coral">✦</span>
                <span><b>{primaryDestination.country}</b><small>{primaryDestination.tags[0] ?? "目的地信息"}</small></span>
              </div>
            )}
            {primaryInsight && (
              <div className="floating-card floating-card-bottom">
                <span className="mini-icon mini-sun">✹</span>
                <span><b>{TYPE_LABELS[primaryInsight.type]}</b><small>{primaryInsight.title}</small></span>
              </div>
            )}
          </div>
          <div className="hero-visual-footer">
            <div>
              <span>{data ? data.meta.source : "真实数据"}</span>
              <strong>{data ? formatLastSynced(data.meta.lastSyncedAt) : dataMessage}</strong>
            </div>
            <span className="hero-footer-arrow" aria-hidden="true">↗</span>
          </div>
        </div>
      </section>

      <section className="search-panel section-container" id="explore">
        <div className="search-panel-top">
          <div>
            <span className="section-kicker">
              {liveData ? "实时数据探索" : data?.meta.isDemo ? "演示数据探索" : dataState === "degraded" ? "数据可能已过期" : dataState === "loading" ? "数据加载中" : "数据服务尚未配置"}
            </span>
            <h2>你想先了解什么？</h2>
          </div>
          <button className="sync-button" onClick={handleSync} disabled={syncing || controlsDisabled}>
            <span className={syncing ? "sync-icon spinning" : "sync-icon"}>↻</span>
            {syncing ? "同步中" : "更新数据"}
            <small>{formatSyncLabel(data?.meta ?? null)}</small>
          </button>
        </div>
        <div className="search-controls">
          <label className="search-input-wrap" htmlFor="global-search">
            <span aria-hidden="true">⌕</span>
            <input
              id="global-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索国家、院校、专业、奖学金..."
              disabled={controlsDisabled}
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="hero-pills" aria-label="热门搜索">
            {HERO_PILLS.map((pill) => (
              <button
                key={pill}
                className="hero-pill"
                disabled={controlsDisabled}
                onClick={() => {
                  setQuery(pill);
                  scrollTo("insights", "申请信息");
                }}
              >
                {pill} <span>↗</span>
              </button>
            ))}
          </div>
        </div>
        <div className="search-panel-footer">
          <span className={liveData ? "data-status live" : data?.meta.isDemo ? "data-status demo" : "data-status limited"}>
            <i className="status-dot" /> {data?.meta.isDemo
              ? "演示数据 · 仅用于开发验证"
              : data
                ? `${data.meta.isStale ? "数据可能已过期" : data.meta.source} · ${formatLastSynced(data.meta.lastSyncedAt)}`
                : dataMessage}
          </span>
          <button disabled={controlsDisabled} onClick={() => { setQuery(""); setSelectedCountry("全部国家"); setSelectedType("all"); }}>
            清空筛选 <span>×</span>
          </button>
        </div>
        {(!data || data.meta.isDemo || dataState === "degraded") && (
          <DataAvailabilityNotice title={data?.meta.isDemo ? "演示数据" : dataCopy.title} description={data?.meta.isDemo ? "这些内容仅用于开发环境的界面验证，不代表实时或权威数据。" : dataCopy.description} />
        )}
      </section>

      <section className="section-container destinations-section" id="destinations">
        <div className="section-heading">
          <div>
            <span className="section-kicker">01 · 目的地概览</span>
            <h2>从一个目的地开始</h2>
          </div>
          <button className="text-link" disabled={controlsDisabled} onClick={() => { setSelectedCountry("全部国家"); scrollTo("insights", "申请信息"); }}>
            查看全部目的地 <span>↗</span>
          </button>
        </div>
        {data ? <>
          <div className="destination-grid">
          {data.destinations.slice(0, 4).map((destination, index) => (
            <DestinationCard
              destination={destination}
              index={index}
              key={destination.id}
              onSelect={chooseDestination}
            />
          ))}
          </div>
          <div className="destination-mini-row">
          {data.destinations.slice(4).map((destination) => (
            <button className="destination-mini" key={destination.id} onClick={() => chooseDestination(destination)}>
              <span>{destination.flag}</span>
              <strong>{destination.country}</strong>
              <small>{destination.stat} 项目</small>
              <span className="mini-arrow">↗</span>
            </button>
          ))}
          <button className="destination-mini destination-mini-all" onClick={() => scrollTo("insights", "申请信息")}>
            <span className="plus-bubble">+</span>
            <strong>查看全部目的地</strong>
            <small>浏览当前可用数据</small>
            <span className="mini-arrow">↗</span>
          </button>
          </div>
        </> : <DataAvailabilityNotice title={dataCopy.title} description={dataCopy.description} />}
      </section>

      <section className="section-container insights-layout" id="insights">
        <div className="insights-main">
          <div className="section-heading insights-heading">
            <div>
              <span className="section-kicker">02 · 申请信息</span>
              <h2>把复杂问题，拆成下一步</h2>
            </div>
            <span className="result-count">{data ? `${visibleInsights.length} 条匹配` : "暂无数据"}</span>
          </div>
          {data && (
            <div className="data-brief" aria-label="当前信息构成">
              <div className="data-brief-summary">
                <span className="section-kicker">DATA BRIEF · 数据切片</span>
                <strong>{data.insights.length}</strong>
                <p>条可追溯信息，覆盖 {countryCount} 个国家与 {sourceCount} 个当前可用来源。</p>
              </div>
              <div className="distribution-chart">
                {insightDistribution.map(({ type, count, percent }) => (
                  <button key={type} onClick={() => setSelectedType(type)} aria-label={`筛选${TYPE_LABELS[type]}，${count}条`}>
                    <span><b>{TYPE_LABELS[type]}</b><small>{count}</small></span>
                    <i><em style={{ width: `${percent}%` }} /></i>
                  </button>
                ))}
              </div>
              <div className="source-pulse">
                <span>来源状态</span>
                <strong>{sourceCount}/{data.meta.sources?.length ?? sourceCount}</strong>
                <small>{data.meta.isStale ? "部分来源暂不可用" : "当前来源均可追溯"}</small>
              </div>
            </div>
          )}
          <div className="filter-bar">
            <div className="filter-tabs" role="tablist" aria-label="信息类型">
              {(Object.keys(TYPE_LABELS) as Array<InsightType | "all">).map((type) => (
                <button
                  className={selectedType === type ? "filter-tab active" : "filter-tab"}
                  key={type}
                  onClick={() => setSelectedType(type)}
                  disabled={controlsDisabled}
                  role="tab"
                  aria-selected={selectedType === type}
                >
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            <label className="country-select-wrap">
              <span>目的地</span>
              <select disabled={controlsDisabled} value={selectedCountry} onChange={(event) => setSelectedCountry(event.target.value)}>
                <option>全部国家</option>
                {(data?.destinations ?? []).map((destination) => <option key={destination.id}>{destination.country}</option>)}
              </select>
              <span className="select-chevron">⌄</span>
            </label>
          </div>
          <div className="insight-list">
            {!data ? (
              <DataAvailabilityNotice title={dataCopy.title} description={dataCopy.description} />
            ) : visibleInsights.length ? visibleInsights.map((insight, index) => (
              <InsightCard
                insight={insight}
                index={index}
                isSaved={savedIds.includes(insight.id)}
                key={insight.id}
                onOpen={() => setSelectedInsight(insight)}
                onSave={() => toggleSaved(insight.id)}
              />
            )) : (
              <div className="empty-state">
                <span>⌕</span>
                <strong>还没有找到匹配内容</strong>
                <p>换个关键词，或试试清空筛选。</p>
                <button onClick={() => { setQuery(""); setSelectedCountry("全部国家"); setSelectedType("all"); }}>清空筛选</button>
              </div>
            )}
          </div>
        </div>

        <aside className="radar-card" id="planning">
          <div className="radar-card-top">
            <div>
              <span className="section-kicker">03 · 规划工具</span>
              <h3>你的申请雷达</h3>
            </div>
            <span className="radar-status">未登录</span>
          </div>
          <p className="radar-intro">登录后保存你的目标院校，启程会帮你把下一步排好。</p>
          <div className="radar-progress-block">
            <div className="radar-progress-label"><span>探索阶段</span><strong>2 / 5</strong></div>
            <div className="radar-progress"><i /></div>
          </div>
          <div className="radar-steps">
            <div className="radar-step complete"><span>✓</span><div><strong>确定目标方向</strong><small>已完成 · 选择感兴趣的国家</small></div></div>
            <div className="radar-step current"><span>2</span><div><strong>收集申请信息</strong><small>进行中 · 还有 4 个关键节点</small></div></div>
            <div className="radar-step"><span>3</span><div><strong>匹配院校与项目</strong><small>解锁后继续</small></div></div>
          </div>
          <button className="radar-button" onClick={() => openAuth("signup")}>创建我的申请清单 <span>↗</span></button>
          <div className="radar-footnote"><span>✦</span> 免费使用 · 无需绑定银行卡</div>
        </aside>
      </section>

      <section className="section-container planning-strip">
        <div className="planning-copy">
          <span className="section-kicker">给正在认真准备的你</span>
          <h2>别让信息的噪音，<br /><em>盖过你真正想去的地方。</em></h2>
          <p>每一次收藏，都会变成你的申请地图。登录后把零散的信息，整理成一条能执行的路径。</p>
          <button className="button-primary" onClick={() => openAuth("signup")}>建立我的路线 <span>↗</span></button>
        </div>
        <div className="planning-art" aria-hidden="true">
          <div className="planning-stamp">NEXT<br />STOP</div>
          <div className="planning-route route-one"><span>01</span><i /></div>
          <div className="planning-route route-two"><span>02</span><i /></div>
          <div className="planning-route route-three"><span>03</span><i /></div>
          <div className="plane-mark">↗</div>
          <span className="art-label label-one">找到方向</span>
          <span className="art-label label-two">比较选择</span>
          <span className="art-label label-three">开始出发</span>
        </div>
      </section>

      <footer className="footer section-container">
        <div className="footer-brand">
          <button className="brand" onClick={() => scrollTo("top")}>
            <span className="brand-mark" aria-hidden="true">↗</span>
            <span>启程<small>STUDY ABROAD</small></span>
          </button>
          <p>让每一个想出发的人，都更接近自己的答案。</p>
        </div>
        <div className="footer-links">
          <div><span>探索</span><button onClick={() => scrollTo("destinations")}>目的地</button><button onClick={() => scrollTo("insights")}>申请信息</button></div>
          <div><span>工具</span><button onClick={openAssessment}>快速评估</button><button onClick={() => openAuth("signup")}>我的清单</button></div>
          <div><span>关于</span><button onClick={() => showToast("我们会在下一个版本开放顾问预约")}>顾问服务</button><button onClick={() => showToast("帮助中心正在整理中")}>帮助中心</button></div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 启程 · Study Abroad</span>
          <span className={`service-status ${healthState}`}><i className="status-dot" /> 服务状态 · {healthStateCopy(healthState)}</span>
        </div>
      </footer>

      {selectedInsight && (
        <div className="overlay" onMouseDown={() => setSelectedInsight(null)}>
          <article className="detail-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <button className="drawer-close" aria-label="关闭详情" onClick={() => setSelectedInsight(null)}>×</button>
            <div className={`detail-hero detail-${selectedInsight.accent}`}>
              <div className="detail-icon">{selectedInsight.icon}</div>
              <span>{TYPE_LABELS[selectedInsight.type]} · {selectedInsight.country}</span>
              <h2>{selectedInsight.title}</h2>
              <small>{selectedInsight.updated} 更新</small>
            </div>
            <div className="detail-body">
              <div className="detail-tags">{selectedInsight.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
              <p className="detail-lead">{selectedInsight.summary}</p>
              <div className="detail-copy">{selectedInsight.detail.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
              {selectedInsight.sourceUrl && selectedInsight.sourceLabel && (
                <a className="button-quiet" href={selectedInsight.sourceUrl} target="_blank" rel="noreferrer">
                  查看来源：{selectedInsight.sourceLabel} ↗
                </a>
              )}
              <button className="button-primary detail-save" onClick={() => toggleSaved(selectedInsight.id)}>
                {savedIds.includes(selectedInsight.id) ? "已保存到我的清单" : "保存到我的清单"} <span>{savedIds.includes(selectedInsight.id) ? "✓" : "↗"}</span>
              </button>
            </div>
          </article>
        </div>
      )}

      {modal === "auth" && (
        <AuthModal
          mode={authMode}
          onClose={() => setModal(null)}
          onModeChange={setAuthMode}
          resetToken={resetToken}
          onAuthenticated={(user) => {
            setAuthUser(user);
            setModal(null);
          }}
          onSuccess={(message) => showToast(message)}
        />
      )}

      {modal === "assessment" && (
        <AssessmentModal
          step={assessmentStep}
          answers={assessmentAnswers}
          onClose={() => setModal(null)}
          onAnswer={(answer) => {
            setAssessmentAnswers((current) => [...current, answer]);
            setAssessmentStep((current) => current + 1);
          }}
          onRestart={resetAssessment}
          onSignup={() => openAuth("signup")}
        />
      )}

      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function DataAvailabilityNotice({ title, description }: { title: string; description: string }) {
  return (
    <div className="data-state-card" role="status">
      <span aria-hidden="true">i</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

function DestinationCard({
  destination,
  index,
  onSelect,
}: {
  destination: Destination;
  index: number;
  onSelect: (destination: Destination) => void;
}) {
  return (
    <button className={`destination-card destination-${destination.color}`} onClick={() => onSelect(destination)}>
      <div className="destination-card-top"><span className="destination-index">0{index + 1}</span><span className="destination-flag">{destination.flag}</span><span className="destination-arrow">↗</span></div>
      <div className="destination-card-copy"><span className="destination-region">{destination.region}</span><h3>{destination.country}</h3><p>{destination.headline}</p></div>
      <div className="destination-card-bottom"><span>{destination.stat} <small>{destination.statLabel}</small></span><span className="trend"><i>↑</i> {destination.trend}</span></div>
      <div className="destination-tags">{destination.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    </button>
  );
}

function InsightCard({
  insight,
  index,
  isSaved,
  onOpen,
  onSave,
}: {
  insight: Insight;
  index: number;
  isSaved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <article className={`insight-card ${index === 0 ? "insight-card-featured" : ""}`}>
      <div className={`insight-number insight-number-${insight.accent}`}>0{index + 1}</div>
      <div className="insight-card-content">
        <div className="insight-card-top"><span className={`type-badge type-${insight.accent}`}><i>{insight.icon}</i>{TYPE_LABELS[insight.type]}</span><span>{insight.country}</span><span className="insight-updated">{insight.updated}</span></div>
        <button className="insight-title-button" onClick={onOpen}><h3>{insight.title}</h3></button>
        <p>{insight.summary}</p>
        {index === 0 && insight.detail[0] && <blockquote>{insight.detail[0]}</blockquote>}
        <div className="insight-card-bottom"><div className="insight-tags">{insight.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><span>{insight.meta}</span></div>
      </div>
      <div className="insight-card-actions"><button className={isSaved ? "save-button saved" : "save-button"} onClick={onSave} aria-label={isSaved ? "取消收藏" : "收藏"}>{isSaved ? "♥" : "♡"}</button><button className="open-button" onClick={onOpen} aria-label="打开详情">↗</button></div>
    </article>
  );
}

function AuthModal({
  mode,
  onClose,
  onModeChange,
  resetToken,
  onAuthenticated,
  onSuccess,
}: {
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
  resetToken: string;
  onAuthenticated: (user: AuthUser) => void;
  onSuccess: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const titles = { login: "欢迎回来", signup: "从你的第一步开始", reset: "找回你的路线", "reset-confirm": "设置新密码" };
  const descriptions = {
    login: "保存你的选择，随时回来继续规划。",
    signup: "创建一个免费账户，把灵感变成申请清单。",
    reset: "输入注册邮箱，我们会把下一步发给你。",
    "reset-confirm": "设置一个新的安全密码，完成后所有旧会话都会失效。",
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (mode !== "reset-confirm" && !email.includes("@")) {
      setMessage("请输入有效的邮箱地址");
      return;
    }
    if (mode !== "reset" && password.length < 12) {
      setMessage("密码至少需要 12 个字符");
      return;
    }
    if (mode !== "reset" && (!/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setMessage("密码必须同时包含字母和数字");
      return;
    }
    if ((mode === "signup" || mode === "reset-confirm") && password !== passwordConfirmation) {
      setMessage("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      const endpoint = mode === "signup"
        ? "/api/auth/register"
        : mode === "login"
          ? "/api/auth/login"
          : mode === "reset"
            ? "/api/auth/forgot-password"
            : "/api/auth/reset-password";
      const payload = mode === "signup"
        ? { email, password, displayName: name }
        : mode === "login"
          ? { email, password }
          : mode === "reset"
            ? { email }
            : { token: resetToken, password };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as AuthApiBody;
      if (!response.ok || body.ok !== true) {
        throw new Error(body.error?.message ?? "操作失败，请稍后重试");
      }
      if (mode === "login" && body.data && "email" in body.data) {
        onAuthenticated(body.data as AuthUser);
        onSuccess("登录成功 · 你的清单已准备好");
        return;
      }
      if (mode === "signup") {
        setMessage("账户已创建，请前往邮箱完成验证");
        onSuccess("验证邮件已发送");
      } else if (mode === "reset") {
        setMessage("如果该邮箱已注册，重置邮件将很快送达");
        onSuccess("密码重置请求已受理");
      } else {
        setMessage("密码已更新，现在可以登录");
        onModeChange("login");
        setPassword("");
        setPasswordConfirmation("");
        onSuccess("密码已安全更新");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay auth-overlay" onMouseDown={onClose}>
      <div className="auth-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="drawer-close" aria-label="关闭登录" onClick={onClose}>×</button>
        <div className="auth-aside">
          <span className="eyebrow"><span className="eyebrow-dot" />启程账户</span>
          <h2>把你看中的每一个选择，<em>留在自己的地图上。</em></h2>
          <div className="auth-quote"><span>“</span><p>好的规划不是替你决定，而是让你更确定自己想要什么。</p><small>— 启程编辑部</small></div>
          <div className="auth-aside-note"><span className="mini-icon mini-sun">✹</span><span><strong>免费使用</strong><small>收藏、比较和申请时间线都不收费</small></span></div>
        </div>
        <div className="auth-form-panel">
          <div className="auth-form-heading"><span className="section-kicker">{mode === "reset" || mode === "reset-confirm" ? "安全找回" : "个人工作台"}</span><h3>{titles[mode]}</h3><p>{descriptions[mode]}</p></div>
          {(mode === "login" || mode === "signup") && <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { onModeChange("login"); setMessage(""); }}>登录</button><button className={mode === "signup" ? "active" : ""} onClick={() => { onModeChange("signup"); setMessage(""); }}>注册</button></div>}
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "signup" && <label>你的称呼<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：林墨" autoComplete="name" /></label>}
            {mode !== "reset-confirm" && <label>邮箱地址<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>}
            {mode !== "reset" && <label>{mode === "reset-confirm" ? "新密码" : "密码"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="12–128 位，包含字母和数字" autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>}
            {(mode === "signup" || mode === "reset-confirm") && <label>确认密码<input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder="再次输入密码" autoComplete="new-password" required /></label>}
            {mode === "login" && <button type="button" className="form-link" onClick={() => { onModeChange("reset"); setMessage(""); }}>忘记密码？</button>}
            {message && <div className="form-message" role="status">{message}</div>}
            <button className="button-primary auth-submit" disabled={submitting} type="submit">{submitting ? "正在安全处理" : mode === "login" ? "登录启程" : mode === "signup" ? "创建免费账户" : mode === "reset" ? "发送重置链接" : "更新密码"} <span>↗</span></button>
          </form>
          <p className="auth-legal">继续即表示你同意启程的服务条款与隐私政策。<br />账户密码经过单向哈希处理，邮件验证与重置链接均会自动失效。</p>
        </div>
      </div>
    </div>
  );
}

function AssessmentModal({
  step,
  answers,
  onClose,
  onAnswer,
  onRestart,
  onSignup,
}: {
  step: number;
  answers: string[];
  onClose: () => void;
  onAnswer: (answer: string) => void;
  onRestart: () => void;
  onSignup: () => void;
}) {
  const questions = [
    { eyebrow: "01 / 03", title: "你现在最想去哪里？", options: ["英国 / 欧洲", "美国 / 加拿大", "澳洲 / 新西兰", "亚洲地区"] },
    { eyebrow: "02 / 03", title: "你更看重什么？", options: ["专业与排名", "就业与签证", "预算与性价比", "生活方式"] },
    { eyebrow: "03 / 03", title: "你准备到哪一步了？", options: ["还在了解方向", "已经有目标国家", "开始准备材料", "马上要提交申请"] },
  ];
  const current = questions[step];

  return (
    <div className="overlay assessment-overlay" onMouseDown={onClose}>
      <div className="assessment-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="drawer-close" aria-label="关闭评估" onClick={onClose}>×</button>
        {step < questions.length ? <>
          <div className="assessment-top"><span className="section-kicker">启程快速评估</span><div className="assessment-progress"><i style={{ width: `${((step + 1) / 3) * 100}%` }} /></div><span>{step + 1} / 3</span></div>
          <div className="assessment-heading"><span>{current.eyebrow}</span><h2>{current.title}</h2><p>选一个最接近你现在状态的答案，我们会据此生成一张起步路线。</p></div>
          <div className="assessment-options">{current.options.map((option) => <button key={option} onClick={() => onAnswer(option)}><span>{String.fromCharCode(65 + current.options.indexOf(option))}</span>{option}<i>↗</i></button>)}</div>
          <div className="assessment-foot"><span>无需登录 · 结果只属于你</span><span>{answers.length ? `已完成 ${answers.length} 题` : "约 2 分钟完成"}</span></div>
        </> : <div className="assessment-result"><div className="result-orbit"><span>✦</span></div><span className="section-kicker">你的起步方向</span><h2>先从「目标清晰度」开始，<em>再谈哪所学校。</em></h2><p>根据你的回答，我们建议先整理目标国家、专业偏好与预算，再去比较院校。启程已经为你准备好下一步。</p><div className="result-tags"><span>{answers[0]}</span><span>{answers[1]}</span><span>{answers[2]}</span></div><button className="button-primary" onClick={onSignup}>保存这份路线 <span>↗</span></button><button className="button-quiet" onClick={onRestart}>重新评估</button></div>}
      </div>
    </div>
  );
}
