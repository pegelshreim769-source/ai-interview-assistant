import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicComplianceConfig } from "../lib/compliance/types";
import { BrandLogo } from "./brand-logo";
import { ComplianceFooter } from "./compliance-footer";

export function PolicyLayout({
  title,
  eyebrow,
  description,
  config,
  children
}: {
  title: string;
  eyebrow: string;
  description: string;
  config: PublicComplianceConfig;
  children: ReactNode;
}) {
  return (
    <main className="policy-page">
      <header className="policy-header">
        <Link href="/access" className="policy-brand" aria-label="返回 Interview Studio">
          <BrandLogo className="brand-logo-mark" title="Interview Studio" />
          <span>INTERVIEW STUDIO</span>
        </Link>
        <Link href="/access" className="policy-back-link">返回产品</Link>
      </header>
      <article className="policy-document">
        <div className="policy-hero">
          <p className="policy-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="policy-lead">{description}</p>
          <dl className="policy-meta">
            <div><dt>政策版本</dt><dd>{config.policyVersion}</dd></div>
            <div><dt>生效日期</dt><dd>{config.policyEffectiveDate}</dd></div>
            <div><dt>更新日期</dt><dd>{config.policyUpdatedDate}</dd></div>
          </dl>
          {!config.configured ? (
            <p className="policy-config-warning" role="status">当前为上线前预览，运营主体、联系信息或模型公示仍待产品经理确认。</p>
          ) : null}
        </div>
        <div className="policy-content">{children}</div>
      </article>
      <ComplianceFooter />
    </main>
  );
}
