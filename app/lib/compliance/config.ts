import "server-only";

import type { ComplianceCheckResult, PublicComplianceConfig } from "./types";

const UNCONFIRMED = "待运营方确认";
const REQUIRED_PUBLIC_FIELDS = [
  "PUBLIC_OPERATOR_NAME",
  "PUBLIC_CONTACT_EMAIL",
  "PUBLIC_POLICY_VERSION",
  "PUBLIC_POLICY_EFFECTIVE_DATE",
  "PUBLIC_POLICY_UPDATED_DATE",
  "PUBLIC_AI_PROVIDER_NAME",
  "PUBLIC_CHAT_MODEL_NAME",
  "PUBLIC_ASR_PROVIDER_NAME",
  "PUBLIC_ASR_MODEL_NAME",
  "PUBLIC_MODEL_FILING_INFO",
  "PUBLIC_COMPLAINT_RESPONSE_DAYS"
] as const;

function normalized(env: NodeJS.ProcessEnv, key: (typeof REQUIRED_PUBLIC_FIELDS)[number]) {
  return env[key]?.trim() || "";
}

export function isCompliancePlaceholder(value: string) {
  const lower = value.trim().toLowerCase();
  return (
    !lower ||
    lower.includes("replace_") ||
    lower.includes("replace-with") ||
    lower.includes("your_") ||
    lower.includes("example.") ||
    lower.includes("placeholder") ||
    lower.includes("待确认") ||
    lower.includes("待运营方") ||
    lower === "tbd" ||
    lower === "todo"
  );
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function validPolicyVersion(value: string) {
  return /^[a-zA-Z0-9._-]{1,64}$/.test(value);
}

function validResponseDays(value: string) {
  if (!/^\d+$/.test(value)) return false;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 1 && days <= 90;
}

export function validateComplianceEnvironment(env: NodeJS.ProcessEnv = process.env): ComplianceCheckResult {
  const errors: string[] = [];

  for (const key of REQUIRED_PUBLIC_FIELDS) {
    const value = normalized(env, key);
    if (isCompliancePlaceholder(value)) errors.push(`${key} 缺失或仍为占位符。`);
  }

  const email = normalized(env, "PUBLIC_CONTACT_EMAIL");
  if (email && !isCompliancePlaceholder(email) && !isEmail(email)) {
    errors.push("PUBLIC_CONTACT_EMAIL 不是有效邮箱地址。");
  }

  const version = normalized(env, "PUBLIC_POLICY_VERSION");
  if (version && !isCompliancePlaceholder(version) && !validPolicyVersion(version)) {
    errors.push("PUBLIC_POLICY_VERSION 仅允许字母、数字、点、下划线和连字符，长度不超过 64。" );
  }

  for (const key of ["PUBLIC_POLICY_EFFECTIVE_DATE", "PUBLIC_POLICY_UPDATED_DATE"] as const) {
    const value = normalized(env, key);
    if (value && !isCompliancePlaceholder(value) && !isIsoDate(value)) errors.push(`${key} 必须使用 YYYY-MM-DD。`);
  }

  const responseDays = normalized(env, "PUBLIC_COMPLAINT_RESPONSE_DAYS");
  if (responseDays && !isCompliancePlaceholder(responseDays) && !validResponseDays(responseDays)) {
    errors.push("PUBLIC_COMPLAINT_RESPONSE_DAYS 必须是 1—90 的整数。");
  }

  if (env.NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC?.trim().toLowerCase() === "true") {
    errors.push("生产上线前必须保持 NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC=false，当前同步缺少安全的账号归属验证。" );
  }

  return { ok: errors.length === 0, errors };
}

function displayValue(value: string) {
  return isCompliancePlaceholder(value) ? UNCONFIRMED : value;
}

export function readPublicComplianceConfig(env: NodeJS.ProcessEnv = process.env): PublicComplianceConfig {
  const checked = validateComplianceEnvironment(env);
  const responseDays = normalized(env, "PUBLIC_COMPLAINT_RESPONSE_DAYS");
  return {
    operatorName: displayValue(normalized(env, "PUBLIC_OPERATOR_NAME")),
    contactEmail: displayValue(normalized(env, "PUBLIC_CONTACT_EMAIL")),
    policyVersion: displayValue(normalized(env, "PUBLIC_POLICY_VERSION")),
    policyEffectiveDate: displayValue(normalized(env, "PUBLIC_POLICY_EFFECTIVE_DATE")),
    policyUpdatedDate: displayValue(normalized(env, "PUBLIC_POLICY_UPDATED_DATE")),
    aiProviderName: displayValue(normalized(env, "PUBLIC_AI_PROVIDER_NAME")),
    chatModelName: displayValue(normalized(env, "PUBLIC_CHAT_MODEL_NAME")),
    asrProviderName: displayValue(normalized(env, "PUBLIC_ASR_PROVIDER_NAME")),
    asrModelName: displayValue(normalized(env, "PUBLIC_ASR_MODEL_NAME")),
    modelFilingInfo: displayValue(normalized(env, "PUBLIC_MODEL_FILING_INFO")),
    complaintResponseDays: validResponseDays(responseDays) ? Number(responseDays) : null,
    configured: checked.ok
  };
}

export function currentPolicyVersion(env: NodeJS.ProcessEnv = process.env) {
  const version = normalized(env, "PUBLIC_POLICY_VERSION");
  return validPolicyVersion(version) && !isCompliancePlaceholder(version) ? version : "local-unconfigured";
}
