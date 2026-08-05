"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ComplianceFooter } from "../components/compliance-footer";

type AccessClientProps = {
  nextPath: string;
  initialServiceError: boolean;
  policyVersion: string;
};

type AccessState = "checking" | "signed_out" | "policy_required" | "confirming_policy" | "submitting" | "authenticated" | "unavailable";

type AccessResponse = {
  authenticated?: boolean;
  expires_at?: string;
  error?: string;
  code?: string;
  policy_acceptance_required?: boolean;
  policy_version?: string;
};

export function AccessClient({ nextPath, initialServiceError, policyVersion }: AccessClientProps) {
  const router = useRouter();
  const [invitationCode, setInvitationCode] = useState("");
  const [state, setState] = useState<AccessState>(initialServiceError ? "unavailable" : "checking");
  const [message, setMessage] = useState(initialServiceError ? "访问验证服务暂时不可用，请稍后再试。" : "");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/access/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as AccessResponse;
        if (!active) return;
        if (response.status === 503) {
          setState("unavailable");
          setMessage("访问验证服务暂时不可用，请稍后再试。");
          return;
        }
        if (payload.authenticated) {
          setState("authenticated");
          setMessage("当前浏览器已通过封闭测试验证。" );
        } else if (payload.policy_acceptance_required) {
          setState("policy_required");
          setMessage("政策版本已更新，请重新阅读并确认后继续。" );
        } else {
          setState("signed_out");
          setMessage("");
        }
      })
      .catch(() => {
        if (!active) return;
        setState("unavailable");
        setMessage("访问验证服务暂时不可用，请稍后再试。");
      });
    return () => {
      active = false;
    };
  }, []);

  async function redeemInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitationCode.trim() || !acceptedPolicies || state === "submitting") return;
    setState("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/access/redeem", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitation_code: invitationCode,
          accept_policies: true,
          policy_version: policyVersion
        })
      });
      const payload = (await response.json()) as AccessResponse;
      setInvitationCode("");
      setAcceptedPolicies(false);

      if (!response.ok) {
        setState(response.status === 503 ? "unavailable" : "signed_out");
        setMessage(payload.error || "暂时无法验证邀请码，请稍后再试。");
        return;
      }

      setState("authenticated");
      setMessage("验证成功，正在进入 Interview Studio…");
      router.replace(nextPath);
      router.refresh();
    } catch {
      setInvitationCode("");
      setState("unavailable");
      setMessage("访问验证服务暂时不可用，请稍后再试。");
    }
  }

  async function acceptUpdatedPolicies() {
    if (!acceptedPolicies || state === "confirming_policy") return;
    setState("confirming_policy");
    setMessage("");
    try {
      const response = await fetch("/api/access/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept_policies: true, policy_version: policyVersion })
      });
      const payload = (await response.json()) as AccessResponse;
      if (!response.ok) {
        setState(response.status === 503 ? "unavailable" : "policy_required");
        setMessage(payload.error || "暂时无法确认政策版本，请稍后再试。" );
        return;
      }
      setState("authenticated");
      setMessage("确认成功，正在进入 Interview Studio…" );
      router.replace(nextPath);
      router.refresh();
    } catch {
      setState("unavailable");
      setMessage("访问验证服务暂时不可用，请稍后再试。" );
    }
  }

  async function logout() {
    setState("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/access/logout", { method: "POST", credentials: "same-origin" });
      const payload = (await response.json()) as AccessResponse;
      setState(response.ok ? "signed_out" : "unavailable");
      setMessage(response.ok ? "已退出当前封闭测试会话。" : payload.error || "退出失败，请稍后再试。");
      router.refresh();
    } catch {
      setState("unavailable");
      setMessage("访问验证服务暂时不可用，请稍后再试。");
    }
  }

  const busy = state === "checking" || state === "submitting" || state === "confirming_policy";

  return (
    <main className="access-page">
      <section className="access-card" aria-labelledby="access-title">
        <div className="access-brand" aria-label="Interview Studio">
          <span className="access-brand-mark">IS</span>
          <span>INTERVIEW STUDIO</span>
        </div>
        <div className="access-copy">
          <span className="access-kicker">封闭 Beta</span>
          <h1 id="access-title">使用邀请码进入</h1>
          <p>Interview Studio 目前仅向受邀测试用户开放。我们不会要求你提供手机号、姓名或邮箱。</p>
        </div>

        {state === "authenticated" ? (
          <div className="access-session-panel">
            <p className="access-status is-success" role="status">{message}</p>
            <div className="access-actions">
              <button className="access-primary-button" type="button" onClick={() => router.replace(nextPath)}>
                返回产品
              </button>
              <button className="access-secondary-button" type="button" onClick={logout}>
                退出当前封闭测试
              </button>
            </div>
          </div>
        ) : state === "policy_required" || state === "confirming_policy" ? (
          <div className="access-session-panel">
            <p className="access-status" role="status">{message}</p>
            <label className="access-policy-confirmation">
              <input
                type="checkbox"
                checked={acceptedPolicies}
                onChange={(event) => setAcceptedPolicies(event.target.checked)}
                disabled={busy}
              />
              <span>我已阅读并同意 <Link href="/terms" target="_blank">用户协议</Link> 和 <Link href="/privacy" target="_blank">隐私政策</Link></span>
            </label>
            <button className="access-primary-button" type="button" disabled={busy || !acceptedPolicies} onClick={() => void acceptUpdatedPolicies()}>
              {state === "confirming_policy" ? "正在确认…" : "确认并继续"}
            </button>
          </div>
        ) : (
          <form className="access-form" onSubmit={redeemInvitation}>
            <label htmlFor="invitation-code">邀请码</label>
            <input
              id="invitation-code"
              name="invitation-code"
              type="password"
              value={invitationCode}
              onChange={(event) => setInvitationCode(event.target.value)}
              placeholder="请输入邀请码"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={512}
              disabled={busy}
              required
            />
            <label className="access-policy-confirmation">
              <input
                type="checkbox"
                checked={acceptedPolicies}
                onChange={(event) => setAcceptedPolicies(event.target.checked)}
                disabled={busy}
                required
              />
              <span>我已阅读并同意 <Link href="/terms" target="_blank">用户协议</Link> 和 <Link href="/privacy" target="_blank">隐私政策</Link></span>
            </label>
            {message ? <p className={`access-status${state === "unavailable" ? " is-error" : ""}`} role="status">{message}</p> : null}
            <button className="access-primary-button" type="submit" disabled={busy || !invitationCode.trim() || !acceptedPolicies}>
              {state === "checking" ? "正在检查访问状态…" : state === "submitting" ? "正在验证…" : "进入封闭测试"}
            </button>
          </form>
        )}

        <p className="access-footnote">邀请码只用于控制封闭测试访问，不会作为正式账号。当前政策版本：{policyVersion}</p>
      </section>
      <ComplianceFooter />
    </main>
  );
}
