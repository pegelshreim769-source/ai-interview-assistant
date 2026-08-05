"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUsageResponse, MetricTotals, MetricsRange } from "../../lib/observability/types";

const ranges: Array<{ value: MetricsRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" }
];

const endpointNames: Record<string, string> = {
  analyze: "文字练习",
  mock_interview: "模拟面试",
  custom_interview: "定制面试",
  custom_interview_extract: "定制面试解析",
  resume_studio: "简历工作台",
  resume_studio_extract: "简历材料解析",
  transcribe: "语音转写",
  mock_interview_transcribe: "模拟面试转写"
};

function percent(success: number, requests: number) {
  return requests ? `${((success / requests) * 100).toFixed(1)}%` : "—";
}

function money(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function average(totals: MetricTotals) {
  return totals.requests ? Math.round(totals.durationMsSum / totals.requests) : 0;
}

function p95(totals: MetricTotals) {
  if (!totals.requests) return 0;
  const bounds = [500, 1000, 3000, 10_000, 30_000, 60_000, 60_001];
  const target = Math.ceil(totals.requests * 0.95);
  let count = 0;
  for (let i = 0; i < totals.latencyBuckets.length; i += 1) {
    count += totals.latencyBuckets[i];
    if (count >= target) return bounds[i];
  }
  return totals.durationMsMax;
}

function latency(value: number) {
  if (!value) return "—";
  if (value > 60_000) return ">60s";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

export function AdminUsageClient() {
  const router = useRouter();
  const [range, setRange] = useState<MetricsRange>("today");
  const [data, setData] = useState<AdminUsageResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch(`/api/admin/usage?range=${range}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      const payload = (await response.json()) as AdminUsageResponse & { error?: string };
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "聚合指标暂时不可用。");
      setData(payload);
      setState("ready");
      setMessage("");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "聚合指标暂时不可用。");
    }
  }, [range, router]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const cards = useMemo(() => data ? [
    ["AI 请求", data.totals.requests.toLocaleString()],
    ["成功率", percent(data.totals.success, data.totals.requests)],
    ["活跃匿名会话", data.activeAnonymousSessions.toLocaleString()],
    ["费用单位", data.totals.units.toLocaleString()],
    ["估算费用", money(data.totals.estimatedCostCents)],
    ["429", data.totals.status429.toLocaleString()],
    ["503", data.totals.status503.toLocaleString()],
    ["平均延迟", latency(average(data.totals))],
    ["近似 P95", latency(p95(data.totals))]
  ] : [], [data]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><span className="access-kicker">INTERVIEW STUDIO · 运营管理</span><h1>用量与费用</h1><p>仅展示匿名聚合指标，不记录或提供用户级查询。</p></div>
        <div className="admin-header-actions"><button onClick={() => void load()}>刷新</button><button onClick={() => void logout()}>退出</button></div>
      </header>
      <nav className="admin-range" aria-label="统计周期">
        {ranges.map((item) => <button className={range === item.value ? "is-active" : ""} key={item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}
      </nav>
      {state === "loading" ? <section className="admin-state">正在读取聚合指标…</section> : null}
      {state === "error" ? <section className="admin-state is-error">{message}<button onClick={() => void load()}>重试</button></section> : null}
      {data ? <>
        <section className="admin-card-grid">{cards.map(([label, value]) => <article className="admin-stat" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><h2>预算状态</h2><p>{data.costNotice}</p></div><span>暂无精确 Token 数据</span></div><div className="admin-budget-grid">{([data.budget.day, data.budget.month] as const).map((item, index) => <article key={index}><div><span>{index === 0 ? "今日" : "本月"}</span><b className={`status-${item.status}`}>{item.status}</b></div><strong>{money(item.usedCents)} / {money(item.budgetCents)}</strong><div className="admin-progress"><i style={{ width: `${Math.min(100, item.percentage)}%` }} /></div><small>{item.percentage.toFixed(1)}%</small></article>)}</div></section>
        <section className="admin-panel"><h2>接口统计</h2><div className="admin-table-wrap"><table><thead><tr><th>接口</th><th>请求数</th><th>成功率</th><th>费用单位</th><th>估算费用</th><th>平均延迟</th><th>P95</th><th>4xx</th><th>5xx</th></tr></thead><tbody>{data.endpoints.map((row) => <tr key={row.key}><td>{endpointNames[row.key] || row.key}</td><td>{row.requests}</td><td>{percent(row.success, row.requests)}</td><td>{row.units}</td><td>{money(row.estimatedCostCents)}</td><td>{latency(average(row))}</td><td>{latency(p95(row))}</td><td>{row.status4xx}</td><td>{row.status5xx}</td></tr>)}</tbody></table></div></section>
        <div className="admin-two-columns"><section className="admin-panel"><h2>模型统计</h2>{data.models.length ? <div className="admin-table-wrap"><table><thead><tr><th>模型</th><th>调用</th><th>单位</th><th>估算费用</th></tr></thead><tbody>{data.models.map((row) => <tr key={row.key}><td>{row.key}</td><td>{row.requests}</td><td>{row.units}</td><td>{money(row.estimatedCostCents)}</td></tr>)}</tbody></table></div> : <p className="admin-empty">当前周期暂无模型调用。</p>}</section><section className="admin-panel"><h2>错误统计</h2>{data.errors.length ? <div className="admin-error-list">{data.errors.map((row) => <div key={row.code}><code>{row.code}</code><strong>{row.count}</strong><small>{row.trend.map((item) => `${item.period} ${item.count}`).join(" · ")}</small></div>)}</div> : <p className="admin-empty">当前周期暂无错误。</p>}</section></div>
        <footer className="admin-footer">更新时间：{new Date(data.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 每 60 秒自动刷新</footer>
      </> : null}
    </main>
  );
}
