"use client";

import Link from "next/link";
import Image from "next/image";
import {
  BookOpenText,
  Briefcase,
  CaretDown,
  Check,
  ClockCounterClockwise,
  FileText,
  FolderSimple,
  Plus,
  SlidersHorizontal,
  TextT,
  VideoCamera
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";

type PracticeMode = "text" | "mock" | "custom" | "resume";
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
  const collapsed = false;
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const resumeWorkspaceActive = mode === "resume";
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
    if (!workspaceMenuOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setWorkspaceMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [workspaceMenuOpen]);

  return (
    <div className={`app-shell is-modern-workspace mode-${mode} ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <BrandLogo className="brand-logo-mark" title="Interview Studio" />
            </div>
            {!collapsed ? (
              <div>
                <p className="brand-name sidebar-brand-name">INTERVIEW STUDIO</p>
                <p className="sidebar-brand-copy">像真实面试一样，一轮一轮讲顺。</p>
              </div>
            ) : null}
          </div>

          <div className="workspace-switcher workspace-switcher-compact" ref={workspaceMenuRef}>
            <button
              type="button"
              className={`workspace-switcher-button ${workspaceMenuOpen ? "is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={workspaceMenuOpen}
              aria-label={`当前工作区：${resumeWorkspaceActive ? "简历工作台" : "面试 Lab"}`}
              title="切换工作区"
              onClick={() => setWorkspaceMenuOpen((current) => !current)}
            >
              <span className="workspace-switcher-icon" aria-hidden="true">
                {resumeWorkspaceActive ? <FileText size={19} weight="duotone" /> : <Briefcase size={19} weight="duotone" />}
              </span>
              <span className="workspace-switcher-label">{resumeWorkspaceActive ? "简历工作台" : "面试 Lab"}</span>
              <CaretDown className="workspace-switcher-caret" size={15} weight="bold" aria-hidden="true" />
            </button>

            {workspaceMenuOpen ? (
              <div className="workspace-switcher-menu" role="menu" aria-label="切换工作区">
                <Link
                  href="/"
                  role="menuitem"
                  className={`workspace-switcher-option ${!resumeWorkspaceActive ? "is-current" : ""}`}
                  aria-current={!resumeWorkspaceActive ? "page" : undefined}
                  onClick={() => setWorkspaceMenuOpen(false)}
                >
                  <Briefcase className="workspace-option-icon" size={21} weight="duotone" aria-hidden="true" />
                  <span className="workspace-option-copy">
                    <strong>面试 Lab</strong>
                    <small>文字、模拟与定制面试</small>
                  </span>
                  {!resumeWorkspaceActive ? <Check className="workspace-option-check" size={21} weight="bold" aria-hidden="true" /> : null}
                </Link>
                <Link
                  href="/resume-studio"
                  role="menuitem"
                  className={`workspace-switcher-option ${resumeWorkspaceActive ? "is-current" : ""}`}
                  aria-current={resumeWorkspaceActive ? "page" : undefined}
                  onClick={() => setWorkspaceMenuOpen(false)}
                >
                  <FileText className="workspace-option-icon" size={21} weight="duotone" aria-hidden="true" />
                  <span className="workspace-option-copy">
                    <strong>简历工作台</strong>
                    <small>事实核对、岗位定制与面试衔接</small>
                  </span>
                  {resumeWorkspaceActive ? <Check className="workspace-option-check" size={21} weight="bold" aria-hidden="true" /> : null}
                </Link>
                <div className="workspace-mobile-mode-links" aria-label="面试 Lab 练习模式">
                  <Link href="/" onClick={() => setWorkspaceMenuOpen(false)}>文字练习</Link>
                  <Link href="/mock-interview" onClick={() => setWorkspaceMenuOpen(false)}>模拟面试</Link>
                  <Link href="/custom-interview" onClick={() => setWorkspaceMenuOpen(false)}>定制面试</Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {!collapsed ? (
          <div className="resume-sidebar-profile">
            <Image src="/resume-studio/student-avatar.png" alt="面试练习者头像" width={48} height={48} priority unoptimized />
            <div>
              <strong>你好，面试练习者</strong>
              <span>今天也要加油！</span>
            </div>
          </div>
        ) : null}

        <div className="sidebar-section">
          {!collapsed ? <p className="sidebar-section-title">{resumeWorkspaceActive ? "当前工作区" : "练习模式"}</p> : null}
          <nav className="sidebar-nav">
            {resumeWorkspaceActive ? (
              <Link href="/resume-studio" className="sidebar-nav-item is-active" title="简历工作台">
                <FileText className="sidebar-nav-svg" size={19} weight="duotone" aria-hidden="true" />
                {!collapsed ? <span>简历工作台</span> : null}
              </Link>
            ) : null}
            {!resumeWorkspaceActive ? (
              <>
                <Link href="/" className={`sidebar-nav-item ${mode === "text" ? "is-active" : ""}`} title="文字练习">
                  <TextT className="sidebar-nav-svg" size={19} aria-hidden="true" />
                  {!collapsed ? <span>文字练习</span> : null}
                </Link>
                <Link href="/mock-interview" className={`sidebar-nav-item ${mode === "mock" ? "is-active" : ""}`} title="模拟面试">
                  <VideoCamera className="sidebar-nav-svg" size={19} aria-hidden="true" />
                  {!collapsed ? <span>模拟面试</span> : null}
                </Link>
                <Link href="/custom-interview" className={`sidebar-nav-item ${mode === "custom" ? "is-active" : ""}`} title="定制面试">
                  <SlidersHorizontal className="sidebar-nav-svg" size={19} aria-hidden="true" />
                  {!collapsed ? <span>定制面试</span> : null}
                </Link>
              </>
            ) : null}
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
              <BookOpenText className="sidebar-nav-svg" size={18} aria-hidden="true" />
              {!collapsed ? <span>试试示例</span> : null}
            </button>
            <button
              type="button"
              className="sidebar-action-button"
              onClick={onNewRound}
              disabled={!onNewRound || shortcutsDisabled}
              title="新建一轮"
            >
              <Plus className="sidebar-nav-svg" size={18} aria-hidden="true" />
              {!collapsed ? <span>新建一轮</span> : null}
            </button>
            <button
              type="button"
              className={`sidebar-action-button ${!onContinueLatest ? "is-disabled" : ""}`}
              onClick={onContinueLatest}
              disabled={!onContinueLatest || shortcutsDisabled}
              title="继续上一轮"
            >
              <ClockCounterClockwise className="sidebar-nav-svg" size={18} aria-hidden="true" />
              {!collapsed ? <span>继续上一轮</span> : null}
            </button>
          </div>
        </div>

        <div className="sidebar-section sidebar-history-records">
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

        {!collapsed ? (
          <div className="resume-sidebar-upgrade">
            <FolderSimple size={22} weight="duotone" aria-hidden="true" />
            <strong>{resumeWorkspaceActive ? "真实经历优先" : "真实表达优先"}</strong>
            <p>{resumeWorkspaceActive ? "所有改写都需要事实证据，缺口会单独提示。" : "所有追问只基于你的真实经历，不补编项目与结果。"}</p>
          </div>
        ) : null}
      </aside>

      <main className="app-main">
        <div className="app-main-toolbar" aria-hidden="true" />
        {children}
      </main>
    </div>
  );
}
