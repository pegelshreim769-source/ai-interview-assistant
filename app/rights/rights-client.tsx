"use client";

import { FormEvent, useMemo, useState } from "react";
import { clearProjectBusinessData } from "../lib/compliance/client-data";

type ClearState = "idle" | "confirming" | "clearing" | "success" | "partial" | "failed";

export function RightsClient({ contactEmail, responseDays }: { contactEmail: string; responseDays: number | null }) {
  const [clearState, setClearState] = useState<ClearState>("idle");
  const [clearMessage, setClearMessage] = useState("");
  const [requestType, setRequestType] = useState("删除个人信息");
  const [summary, setSummary] = useState("");
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);

  const mailtoHref = useMemo(() => {
    if (!emailReady) return "";
    const subject = `[Interview Studio 个人信息请求] ${requestType}`;
    const body = [
      `请求类型：${requestType}`,
      "",
      "请求说明：",
      summary.trim() || "请在此补充必要说明。",
      "",
      "请勿发送身份证完整号码、账号密钥或其他不必要的敏感信息。"
    ].join("\n");
    return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [contactEmail, emailReady, requestType, summary]);

  async function clearLocalData() {
    setClearState("clearing");
    setClearMessage("");
    try {
      const result = clearProjectBusinessData(window.localStorage);
      let logoutSucceeded = false;
      try {
        const response = await fetch("/api/access/logout", { method: "POST", credentials: "same-origin" });
        logoutSucceeded = response.ok;
      } catch {
        logoutSucceeded = false;
      }

      if (result.failedKeys.length === 0 && logoutSucceeded) {
        setClearState("success");
        setClearMessage(`已清除本机业务数据${result.removedKeys.length ? `（${result.removedKeys.length} 项）` : ""}，并退出当前封闭测试会话。主题和无关浏览器数据未受影响。`);
      } else {
        setClearState("partial");
        setClearMessage("本机数据或退出操作未全部完成。请重试；如仍失败，可清理本站点数据并联系运营方。" );
      }
    } catch {
      setClearState("failed");
      setClearMessage("清除操作失败，请检查浏览器是否允许本站使用本地存储后重试。" );
    }
  }

  function openMail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mailtoHref) window.location.href = mailtoHref;
  }

  return (
    <>
      <section className="rights-action-card">
        <div><h2>清除本机业务数据</h2><p>删除当前浏览器中的面试历史、定制面试材料、简历工作台草稿、交接数据、语音偏好和客户端业务标识，同时退出 Beta 会话。不会删除主题设置或其他网站数据。</p></div>
        <button type="button" className="rights-danger-button" onClick={() => setClearState("confirming")}>清除本机数据</button>
        {clearMessage ? <p className={`rights-result is-${clearState}`} role="status">{clearMessage}</p> : null}
      </section>

      <section>
        <h2>提交个人信息请求或投诉</h2>
        <p>此表单只在浏览器中生成邮件，不会把填写内容提交到本项目服务器、日志、Redis 或分析系统。预计反馈时限为{responseDays ? ` ${responseDays} 个自然日内` : "待运营方配置"}。</p>
        <form className="rights-mail-form" onSubmit={openMail}>
          <label htmlFor="rights-type">请求类型</label>
          <select id="rights-type" value={requestType} onChange={(event) => setRequestType(event.target.value)}>
            <option>查阅个人信息</option><option>更正个人信息</option><option>删除个人信息</option><option>撤回同意</option><option>投诉举报</option>
          </select>
          <label htmlFor="rights-summary">必要说明（选填，最多 800 字）</label>
          <textarea id="rights-summary" maxLength={800} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="请说明涉及的功能、时间范围和希望处理的事项。不要填写身份证完整号码或其他不必要敏感信息。" />
          <p className="rights-form-hint">收件邮箱：{contactEmail}。点击后将打开你本机的邮件应用。</p>
          <button type="submit" className="rights-primary-button" disabled={!emailReady}>生成请求邮件</button>
          {!emailReady ? <p className="rights-result is-partial" role="status">联系邮箱尚未配置，请产品经理完成上线配置后再使用邮件入口。</p> : null}
        </form>
      </section>

      {clearState === "confirming" ? (
        <div className="rights-dialog-backdrop" role="presentation">
          <div className="rights-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-data-title">
            <h2 id="clear-data-title">确认清除本机数据？</h2>
            <p>此操作无法撤销。当前浏览器中的练习历史、简历草稿和客户端业务标识将被删除，当前 Beta 会话也会退出。</p>
            <div className="rights-dialog-actions">
              <button type="button" className="rights-secondary-button" onClick={() => setClearState("idle")}>取消</button>
              <button type="button" className="rights-danger-button" onClick={() => void clearLocalData()}>确认清除并退出</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
