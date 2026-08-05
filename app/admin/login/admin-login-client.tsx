"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginClient({ initialUnavailable }: { initialUnavailable: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    initialUnavailable ? "管理服务暂时不可用，请稍后再试。" : ""
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token })
      });
      const payload = (await response.json()) as { error?: string };
      setToken("");
      if (!response.ok) {
        setMessage(payload.error || "管理员登录失败，请稍后再试。");
        setBusy(false);
        return;
      }
      router.replace("/admin/usage");
      router.refresh();
    } catch {
      setToken("");
      setMessage("管理服务暂时不可用，请稍后再试。");
      setBusy(false);
    }
  }

  return (
    <main className="access-page">
      <section className="access-card" aria-labelledby="admin-login-title">
        <div className="access-brand"><span className="access-brand-mark">IS</span><span>INTERVIEW STUDIO</span></div>
        <div className="access-copy">
          <span className="access-kicker">运营管理</span>
          <h1 id="admin-login-title">管理员登录</h1>
          <p>仅使用独立的高熵管理令牌进入聚合用量看板。这里不会展示用户内容或单次请求。</p>
        </div>
        <form className="access-form" onSubmit={submit}>
          <label htmlFor="admin-access-token">管理员访问令牌</label>
          <input
            id="admin-access-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            required
          />
          {message ? <p className="access-status is-error" role="status">{message}</p> : null}
          <button className="access-primary-button" type="submit" disabled={busy || !token.trim()}>
            {busy ? "正在验证…" : "进入用量看板"}
          </button>
        </form>
        <p className="access-footnote">管理会话独立于封闭 Beta 邀请码，令牌不会存入浏览器存储。</p>
      </section>
    </main>
  );
}
