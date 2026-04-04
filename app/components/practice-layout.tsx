"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type PracticeMode = "text" | "mock";
type SidebarHistoryItem = {
  id: string;
  title: string;
  updatedAt: string;
  status: "in_progress" | "completed" | "interrupted";
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

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo">IL</div>
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
          </nav>
        </div>

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
                      <span className={`sidebar-history-status is-${item.status}`}>{statusLabel(item.status)}</span>
                      <span className="sidebar-history-time">{formatTime(item.updatedAt)}</span>
                    </div>
                    <p className="sidebar-history-title">{item.title}</p>
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

      <main className="app-main">{children}</main>
    </div>
  );
}
