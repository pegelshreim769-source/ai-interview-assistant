"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";

type PracticeMode = "text" | "mock" | "custom";
type ThemePreference = "system" | "light" | "dark";
type AccentTone = "blue" | "teal" | "amber" | "coral" | "white";
type SidebarHistoryItem = {
  id: string;
  title: string;
  updatedAt: string;
  status: "in_progress" | "completed" | "interrupted";
  modeLabel?: string;
  summary?: string;
};

type PracticeLayoutProps = {
  mode: PracticeMode;
  children: ReactNode;
  onTryExample?: () => void;
  onNewRound?: () => void;
  onContinueLatest?: () => void;
  historyItems?: SidebarHistoryItem[];
  onSelectHistory?: (id: string) => void;
  shortcutsDisabled?: boolean;
};

const MODE_DETAILS: Record<
  PracticeMode,
  {
    label: string;
    short: string;
    goal: string;
    rhythm: string[];
  }
> = {
  text: {
    label: "文字练习",
    short: "文",
    goal: "先把真实经历讲清楚，再进入可直接开口练的一版。",
    rhythm: ["第一版", "找卡点", "补信息", "开口练"]
  },
  mock: {
    label: "模拟面试",
    short: "模",
    goal: "像真实面试一样一问一答，训练追问和回答节奏。",
    rhythm: ["进入一轮", "听题", "回答", "小结"]
  },
  custom: {
    label: "定制面试",
    short: "定",
    goal: "按简历和岗位交集来练，优先压实最可能被追问的点。",
    rhythm: ["准备材料", "briefing", "岗位问答", "复盘"]
  }
};

const THEME_STORAGE_KEY = "interview-lab-theme";
const ACCENT_STORAGE_KEY = "interview-lab-accent";
const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; short: string }> = [
  { value: "system", label: "跟随系统", short: "系" },
  { value: "light", label: "浅色", short: "浅" },
  { value: "dark", label: "深色", short: "深" }
];
const ACCENT_OPTIONS: Array<{ value: AccentTone; label: string; swatchClassName: string }> = [
  { value: "blue", label: "雾蓝", swatchClassName: "is-blue" },
  { value: "teal", label: "青岚", swatchClassName: "is-teal" },
  { value: "amber", label: "琥珀", swatchClassName: "is-amber" },
  { value: "coral", label: "珊瑚", swatchClassName: "is-coral" },
  { value: "white", label: "白系", swatchClassName: "is-white" }
];

function resolveTheme(preference: ThemePreference, isSystemDark: boolean) {
  return preference === "system" ? (isSystemDark ? "dark" : "light") : preference;
}

function applyAppearance(preference: ThemePreference, accentTone: AccentTone) {
  if (typeof window === "undefined") return;

  const root = document.documentElement;
  const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolveTheme(preference, isSystemDark);
  root.dataset.accent = accentTone;
}

function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

function readAccentTone(): AccentTone {
  if (typeof window === "undefined") return "blue";

  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return stored === "blue" || stored === "teal" || stored === "amber" || stored === "coral" || stored === "white" ? stored : "blue";
  } catch {
    return "blue";
  }
}

function MenuIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <span className={`sidebar-toggle-lines ${collapsed ? "is-collapsed" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function PracticeLayout({
  mode,
  children,
  onTryExample,
  onNewRound,
  onContinueLatest,
  historyItems = [],
  onSelectHistory,
  shortcutsDisabled = false
}: PracticeLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [accentTone, setAccentTone] = useState<AccentTone>("blue");
  const modeDetail = MODE_DETAILS[mode];
  const sortedHistoryItems = [...historyItems].sort((left, right) => {
    if (left.status === "in_progress" && right.status !== "in_progress") return -1;
    if (left.status !== "in_progress" && right.status === "in_progress") return 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

  function formatTime(value: string) {
    const date = new Date(value);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }

  function statusLabel(status: SidebarHistoryItem["status"]) {
    if (status === "completed") return "已完成";
    if (status === "interrupted") return "已中断";
    return "进行中";
  }

  useEffect(() => {
    const nextPreference = readThemePreference();
    const nextAccentTone = readAccentTone();
    setThemePreference(nextPreference);
    setAccentTone(nextAccentTone);
    applyAppearance(nextPreference, nextAccentTone);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (readThemePreference() === "system") {
        applyAppearance("system", readAccentTone());
      }
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
      return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
    }

    mediaQuery.addListener(handleSystemThemeChange);
    return () => mediaQuery.removeListener(handleSystemThemeChange);
  }, []);

  function updateThemePreference(nextPreference: ThemePreference) {
    setThemePreference(nextPreference);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // Ignore storage failures and still apply the in-memory theme.
    }
    applyAppearance(nextPreference, accentTone);
  }

  function updateAccentTone(nextAccentTone: AccentTone) {
    setAccentTone(nextAccentTone);
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, nextAccentTone);
    } catch {
      // Ignore storage failures and still apply the in-memory accent.
    }
    applyAppearance(themePreference, nextAccentTone);
  }

  return (
    <div className={`app-shell mode-${mode} ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <BrandLogo className="brand-logo-mark" title="Interview Lab" />
            </div>
            {!collapsed ? (
              <div>
                <p className="brand-name sidebar-brand-name">INTERVIEW LAB</p>
                <p className="sidebar-brand-copy">像真实面试一样，一轮一轮讲顺。</p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <MenuIcon collapsed={collapsed} />
          </button>
        </div>

        <div className="sidebar-section">
          {!collapsed ? <p className="sidebar-section-title">模式切换</p> : null}
          <nav className="sidebar-nav">
            <Link href="/" className={`sidebar-nav-item ${mode === "text" ? "is-active" : ""}`} title="文字练习">
              <span className="sidebar-nav-icon">文</span>
              {!collapsed ? <span>文字练习</span> : null}
            </Link>
            <Link href="/mock-interview" className={`sidebar-nav-item ${mode === "mock" ? "is-active" : ""}`} title="模拟面试">
              <span className="sidebar-nav-icon">模</span>
              {!collapsed ? <span>模拟面试</span> : null}
            </Link>
            <Link href="/custom-interview" className={`sidebar-nav-item ${mode === "custom" ? "is-active" : ""}`} title="定制面试">
              <span className="sidebar-nav-icon">定</span>
              {!collapsed ? <span>定制面试</span> : null}
            </Link>
          </nav>
        </div>

        {!collapsed ? (
          <div className="sidebar-section">
            <div className={`sidebar-mode-card is-${mode}`}>
              <p className="sidebar-mode-eyebrow">当前模式</p>
              <h2 className="sidebar-mode-title">{modeDetail.label}</h2>
              <p className="sidebar-mode-copy">{modeDetail.goal}</p>
              <div className="sidebar-mode-flow" aria-hidden="true">
                {modeDetail.rhythm.map((item) => (
                  <span key={item} className="sidebar-mode-chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="sidebar-section sidebar-history-section">
          {!collapsed ? <p className="sidebar-section-title">快捷入口</p> : null}
          <div className="sidebar-actions">
            <button
              type="button"
              className="sidebar-action-button"
              onClick={onTryExample}
              disabled={!onTryExample || shortcutsDisabled}
              title="试试示例"
            >
              <span className="sidebar-nav-icon">例</span>
              {!collapsed ? <span>试试示例</span> : null}
            </button>
            <button
              type="button"
              className="sidebar-action-button"
              onClick={onNewRound}
              disabled={!onNewRound || shortcutsDisabled}
              title="新建一轮"
            >
              <span className="sidebar-nav-icon">新</span>
              {!collapsed ? <span>新建一轮</span> : null}
            </button>
            <button
              type="button"
              className={`sidebar-action-button ${!onContinueLatest ? "is-disabled" : ""}`}
              onClick={onContinueLatest}
              disabled={!onContinueLatest || shortcutsDisabled}
              title="继续上一轮"
            >
              <span className="sidebar-nav-icon">续</span>
              {!collapsed ? <span>继续上一轮</span> : null}
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          {!collapsed ? <p className="sidebar-section-title">历史记录</p> : null}
          {collapsed ? (
            <div className="sidebar-history-collapsed">
              <span className="sidebar-nav-icon">史</span>
            </div>
          ) : sortedHistoryItems.length ? (
            <div className="sidebar-history-list">
              {sortedHistoryItems.slice(0, 5).map((item) => (
                <button key={item.id} type="button" className={`sidebar-history-item is-${item.status}`} onClick={() => onSelectHistory?.(item.id)}>
                  <div className="sidebar-history-main">
                    <div className="sidebar-history-topline">
                      <span className="sidebar-history-mode">{item.modeLabel || "练习"}</span>
                      <span className="sidebar-history-time">{formatTime(item.updatedAt)}</span>
                    </div>
                    <div className="sidebar-history-topline">
                      <span className={`sidebar-history-status is-${item.status}`}>{statusLabel(item.status)}</span>
                    </div>
                    <p className="sidebar-history-title">{item.title}</p>
                    {item.summary ? <p className="sidebar-history-summary">{item.summary}</p> : null}
                  </div>
                  <span className="sidebar-history-link">{item.status === "in_progress" ? "恢复" : "查看"}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="sidebar-note">暂无可继续的练习</p>
          )}
        </div>

        <div className="sidebar-section sidebar-principle">
          {!collapsed ? (
            <>
              <p className="sidebar-section-title">产品原则</p>
              <p className="sidebar-note">只基于真实回答继续追问和整理，不补编项目经历、数据和结果。</p>
            </>
          ) : (
            <p className="sidebar-note is-collapsed">真</p>
          )}
        </div>
      </aside>

      <main className="app-main">
        <div className="app-main-toolbar">
          <div className="appearance-dock" role="group" aria-label="界面外观设置">
            <div className="appearance-group" role="radiogroup" aria-label="界面主题">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  className={`appearance-mode-button ${themePreference === option.value ? "is-active" : ""}`}
                  aria-checked={themePreference === option.value}
                  onClick={() => updateThemePreference(option.value)}
                  title={option.label}
                  aria-label={option.label}
                >
                  <span className="appearance-mode-short">{option.short}</span>
                </button>
              ))}
            </div>
            <span className="appearance-divider" aria-hidden="true" />
            <div className="appearance-group appearance-tone-group" role="radiogroup" aria-label="界面色系">
              {ACCENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  className={`appearance-swatch ${accentTone === option.value ? "is-active" : ""}`}
                  aria-checked={accentTone === option.value}
                  onClick={() => updateAccentTone(option.value)}
                  title={option.label}
                  aria-label={`切换到${option.label}色系`}
                >
                  <span className={`appearance-swatch-dot ${option.swatchClassName}`} />
                </button>
              ))}
            </div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
