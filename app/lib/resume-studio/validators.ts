import {
  RESUME_METHODOLOGY_VERSION,
  extractDateTokens,
  extractMetricTokens,
  isFixedCategory,
  normalizeComparableText
} from "./methodology";
import type {
  ClaimIssue,
  ClaimsValidation,
  EvidenceGap,
  FactLedger,
  FactLedgerItem,
  FinalResumeLine,
  RewrittenExperience
} from "./types";

const GUARDED_CLAIM_TERMS = [
  "主导",
  "牵头",
  "独立负责",
  "从0到1",
  "上线",
  "落地",
  "提升",
  "降低",
  "增长",
  "节省",
  "转化率",
  "营收",
  "大模型",
  "模型评测",
  "AI",
  "LLM",
  "Agent",
  "RAG",
  "Prompt"
] as const;

function includesClaimTerm(value: string, term: string) {
  if (/^[a-z]+$/i.test(term)) {
    return new RegExp(`\\b${term}\\b`, "i").test(value);
  }
  return normalizeComparableText(value).includes(normalizeComparableText(term));
}

function createIssue(index: number, issue: Omit<ClaimIssue, "issue_id">): ClaimIssue {
  return { issue_id: `ISSUE-${String(index + 1).padStart(3, "0")}`, ...issue };
}

function createGap(index: number, gap: Omit<EvidenceGap, "gap_id" | "resolved">): EvidenceGap {
  return { gap_id: `GAP-${String(index + 1).padStart(3, "0")}`, resolved: false, ...gap };
}

export function evidenceMap(ledger: FactLedger) {
  return new Map(ledger.items.map((item) => [item.evidence_id, item]));
}

export function evidenceExistsInSource(item: FactLedgerItem, sourceText: string) {
  const excerpt = normalizeComparableText(item.source_excerpt);
  return !!excerpt && normalizeComparableText(sourceText).includes(excerpt);
}

export function normalizeFactLedger(ledger: FactLedger, sourceText: string): FactLedger {
  const seen = new Set<string>();
  const gaps: EvidenceGap[] = [...(ledger.evidence_gaps || [])];
  const items = (ledger.items || [])
    .filter((item) => item && item.fact?.trim() && item.source_excerpt?.trim())
    .map((item, index) => {
      const evidenceId = /^E\d{3,}$/i.test(item.evidence_id || "") && !seen.has(item.evidence_id) ? item.evidence_id.toUpperCase() : `E${String(index + 1).padStart(3, "0")}`;
      seen.add(evidenceId);
      const sourceBacked = evidenceExistsInSource(item, sourceText);

      if (!sourceBacked) {
        gaps.push(
          createGap(gaps.length, {
            scope: "fact",
            description: `“${item.fact}”缺少可在原始简历中定位的逐字证据。`,
            required_for: "事实确认",
            related_evidence_ids: [evidenceId]
          })
        );
      }

      const fixed = isFixedCategory(item.category) || !!item.fixed;
      return {
        ...item,
        evidence_id: evidenceId,
        fixed,
        change_policy: fixed ? "fixed" : item.change_policy || "paraphrase",
        verification_status: "pending",
        metrics: (item.metrics || []).filter((metric) => metric.raw && item.source_excerpt.includes(metric.raw)),
        source: "resume",
        source_excerpt: item.source_excerpt.trim(),
        fact: item.fact.trim(),
        experience_id: item.experience_id || "general",
        experience_title: item.experience_title || "基础信息",
        risk_note: sourceBacked ? item.risk_note || "" : "原文证据无法定位，需用户补充或确认。"
      } satisfies FactLedgerItem;
    });

  return {
    methodology_version: RESUME_METHODOLOGY_VERSION,
    generated_at: new Date().toISOString(),
    source_resume_text: sourceText,
    items,
    evidence_gaps: gaps
  };
}

function validateClaim(claim: string, evidenceIds: string[], ledger: FactLedger, issues: ClaimIssue[]) {
  const map = evidenceMap(ledger);
  const knownItems = evidenceIds.map((id) => map.get(id)).filter((item): item is FactLedgerItem => !!item);

  if (!evidenceIds.length) {
    issues.push(
      createIssue(issues.length, {
        code: "missing_evidence",
        severity: "error",
        claim,
        message: "这条改写没有关联证据编号，不能进入最终简历。",
        evidence_ids: []
      })
    );
    return;
  }

  const unknownIds = evidenceIds.filter((id) => !map.has(id));
  if (unknownIds.length) {
    issues.push(
      createIssue(issues.length, {
        code: "unknown_evidence",
        severity: "error",
        claim,
        message: `引用了不存在的证据编号：${unknownIds.join("、")}。`,
        evidence_ids: unknownIds
      })
    );
  }

  const pendingIds = knownItems.filter((item) => item.verification_status !== "confirmed").map((item) => item.evidence_id);
  if (pendingIds.length) {
    issues.push(
      createIssue(issues.length, {
        code: "unconfirmed_evidence",
        severity: "error",
        claim,
        message: `仍使用待确认事实：${pendingIds.join("、")}。`,
        evidence_ids: pendingIds
      })
    );
  }

  const supportedText = knownItems.map((item) => `${item.fact}\n${item.source_excerpt}`).join("\n");
  const supportedMetrics = new Set(extractMetricTokens(supportedText));
  const unsupportedMetrics = extractMetricTokens(claim).filter((metric) => !supportedMetrics.has(metric));
  if (unsupportedMetrics.length) {
    issues.push(
      createIssue(issues.length, {
        code: "unsupported_metric",
        severity: "error",
        claim,
        message: `发现没有证据支撑的指标：${unsupportedMetrics.join("、")}。`,
        evidence_ids: evidenceIds
      })
    );
  }

  const unsupportedTerms = GUARDED_CLAIM_TERMS.filter(
    (term) => includesClaimTerm(claim, term) && !includesClaimTerm(supportedText, term)
  );
  if (unsupportedTerms.length) {
    issues.push(
      createIssue(issues.length, {
        code: "unsupported_claim_term",
        severity: "error",
        claim,
        message: `改写加入了证据中没有出现的关键表述：${unsupportedTerms.join("、")}。`,
        evidence_ids: evidenceIds
      })
    );
  }

  const fixedItems = knownItems.filter((item) => item.fixed);
  const supportedDates = new Set(extractDateTokens(supportedText));
  const claimDates = extractDateTokens(claim);
  const unsupportedDates = claimDates.filter((date) => !supportedDates.has(date));
  if (fixedItems.length && unsupportedDates.length) {
    issues.push(
      createIssue(issues.length, {
        code: "fixed_fact_drift",
        severity: "error",
        claim,
        message: `固定日期发生漂移：${unsupportedDates.join("、")}。`,
        evidence_ids: fixedItems.map((item) => item.evidence_id)
      })
    );
  }
}

export function validateRewrites(ledger: FactLedger, rewrites: RewrittenExperience[]): ClaimsValidation {
  const issues: ClaimIssue[] = [];
  let checkedClaims = 0;

  rewrites.forEach((rewrite) => {
    if (rewrite.scene_summary.trim()) {
      checkedClaims += 1;
      validateClaim(rewrite.scene_summary, rewrite.scene_summary_evidence_ids, ledger, issues);
    }

    rewrite.bullets
      .filter((bullet) => bullet.decision === "accepted")
      .forEach((bullet) => {
        checkedClaims += 1;
        validateClaim(bullet.text, bullet.evidence_ids, ledger, issues);
      });
  });

  const evidenceGaps = issues.map((issue, index) =>
    createGap(index, {
      scope: "rewrite",
      description: issue.message,
      required_for: issue.claim,
      related_evidence_ids: issue.evidence_ids
    })
  );

  return {
    methodology_version: RESUME_METHODOLOGY_VERSION,
    valid: !issues.some((issue) => issue.severity === "error"),
    checked_claims: checkedClaims,
    issues,
    evidence_gaps: evidenceGaps
  };
}

export function validateFinalLines(ledger: FactLedger, lines: FinalResumeLine[]) {
  const issues: ClaimIssue[] = [];
  lines.forEach((line) => validateClaim(line.text, line.evidence_ids, ledger, issues));
  return issues;
}

export function confirmedEvidenceIds(ledger: FactLedger) {
  return new Set(ledger.items.filter((item) => item.verification_status === "confirmed").map((item) => item.evidence_id));
}
