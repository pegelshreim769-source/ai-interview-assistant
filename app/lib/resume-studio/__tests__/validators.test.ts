import assert from "node:assert/strict";
import test from "node:test";
import { buildFactLedgerFromText, buildResumePlanFromLedger, rankExperiencesForJd } from "../methodology";
import { validateRewrites } from "../validators";
import {
  SYNTHETIC_AI_JD,
  SYNTHETIC_LEDGER,
  SYNTHETIC_SOE_JD,
  acceptedRewrite
} from "../__fixtures__/samples";

test("不允许写入证据中不存在的指标", () => {
  const validation = validateRewrites(
    SYNTHETIC_LEDGER,
    [acceptedRewrite("评测优化：构建 120 条合成查询测试集，使准确率提升 35%。", ["E001", "E002"])]
  );

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "unsupported_metric" && issue.message.includes("35%")));
});

test("固定日期发生漂移时阻断最终简历", () => {
  const validation = validateRewrites(
    SYNTHETIC_LEDGER,
    [acceptedRewrite("2023.01 - 2025.02 期间负责 AI 产品评测。", ["E005", "E002"])]
  );

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "fixed_fact_drift"));
});

test("没有证据编号的改写必须暴露为证据缺口", () => {
  const validation = validateRewrites(
    SYNTHETIC_LEDGER,
    [acceptedRewrite("主导完整 Agent 平台规模化上线。", [])]
  );

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "missing_evidence"));
  assert.ok(validation.evidence_gaps.some((gap) => gap.description.includes("没有关联证据编号")));
});

test("引用不存在的证据编号时明确报错", () => {
  const validation = validateRewrites(
    SYNTHETIC_LEDGER,
    [acceptedRewrite("完成虚构项目交付。", ["E999"])]
  );

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "unknown_evidence"));
});

test("证据编号真实也不能加入证据中没有的主导、上线或 Agent 表述", () => {
  const validation = validateRewrites(
    SYNTHETIC_LEDGER,
    [acceptedRewrite("主导 Agent 平台上线并完成规模化落地。", ["E001", "E002"])]
  );

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "unsupported_claim_term"));
});

test("互联网 AI JD 优先选择评测经历", () => {
  const ranked = rankExperiencesForJd(SYNTHETIC_LEDGER, SYNTHETIC_AI_JD);
  assert.equal(ranked[0]?.experience_id, "exp-ai");
});

test("央国企 JD 优先选择权限与验收经历", () => {
  const ranked = rankExperiencesForJd(SYNTHETIC_LEDGER, SYNTHETIC_SOE_JD);
  assert.equal(ranked[0]?.experience_id, "exp-soe");
});

test("事实台账保留原始日期、指标和逐字证据", () => {
  const resumeText = [
    "虚构候选人｜产品方向",
    "2024.03 - 2025.02｜虚构组织 A｜产品专员",
    "基于 120 条合成查询建立回归测试集。"
  ].join("\n");
  const ledger = buildFactLedgerFromText(resumeText);

  assert.equal(ledger.items[1]?.category, "date");
  assert.equal(ledger.items[1]?.date?.raw, "2024.03 - 2025.02");
  assert.equal(ledger.items[2]?.metrics[0]?.raw, "120 条");
  assert.equal(ledger.items[2]?.source_excerpt, "基于 120 条合成查询建立回归测试集。");
});

test("岗位规划不把基础身份信息当作可改写经历", () => {
  const ledger = {
    ...SYNTHETIC_LEDGER,
    items: [
      ...SYNTHETIC_LEDGER.items,
      {
        ...SYNTHETIC_LEDGER.items[1],
        evidence_id: "E006",
        fact: "虚构候选人｜产品方向",
        source_excerpt: "虚构候选人｜产品方向",
        category: "identity" as const,
        experience_id: "general",
        experience_title: "基础信息"
      }
    ]
  };
  const plan = buildResumePlanFromLedger(ledger, SYNTHETIC_AI_JD);

  assert.equal(plan.experiences.some((experience) => experience.experience_id === "general"), false);
});

test("JD 中缺少经历证据的 Agent 要求必须进入证据缺口", () => {
  const plan = buildResumePlanFromLedger(SYNTHETIC_LEDGER, `${SYNTHETIC_AI_JD}\n有 Agent 工作流经验优先。`);

  assert.ok(plan.evidence_gaps.some((gap) => gap.required_for.toLowerCase() === "agent"));
});
