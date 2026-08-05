import Link from "next/link";

export function ComplianceFooter() {
  return (
    <footer className="compliance-footer" aria-label="政策与帮助">
      <nav>
        <Link href="/privacy">隐私政策</Link>
        <Link href="/terms">用户协议</Link>
        <Link href="/rights">个人信息权利</Link>
        <Link href="/ai-disclosure">AI 信息公示</Link>
      </nav>
      <span>Interview Studio · AI 辅助求职练习</span>
    </footer>
  );
}
