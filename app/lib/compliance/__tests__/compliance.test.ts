import assert from "node:assert/strict";
import test from "node:test";
import { clearProjectBusinessData, PROJECT_BUSINESS_STORAGE_KEYS } from "../client-data";
import { readPublicComplianceConfig, validateComplianceEnvironment } from "../config";

function completeEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PUBLIC_OPERATOR_NAME: "测试运营主体（虚构）",
    PUBLIC_CONTACT_EMAIL: "privacy@fictional.test",
    PUBLIC_POLICY_VERSION: "v1.0.0-test",
    PUBLIC_POLICY_EFFECTIVE_DATE: "2026-09-01",
    PUBLIC_POLICY_UPDATED_DATE: "2026-09-01",
    PUBLIC_AI_PROVIDER_NAME: "虚构聊天模型服务商",
    PUBLIC_CHAT_MODEL_NAME: "fictional-chat-model",
    PUBLIC_ASR_PROVIDER_NAME: "虚构语音服务商",
    PUBLIC_ASR_MODEL_NAME: "fictional-asr-model",
    PUBLIC_MODEL_FILING_INFO: "虚构测试登记信息（不得用于生产）",
    PUBLIC_COMPLAINT_RESPONSE_DAYS: "15",
    NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC: "false"
  };
}

test("合规配置检查识别缺失值、占位符和非法格式", () => {
  const missing = validateComplianceEnvironment({ NODE_ENV: "test", NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC: "false" });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.length >= 11, true);

  const placeholder = validateComplianceEnvironment({
    ...completeEnvironment(),
    PUBLIC_OPERATOR_NAME: "replace_with_operator_name",
    PUBLIC_CONTACT_EMAIL: "not-an-email",
    PUBLIC_POLICY_EFFECTIVE_DATE: "2026-13-40"
  });
  assert.equal(placeholder.ok, false);
  assert.equal(placeholder.errors.some((value) => value.includes("PUBLIC_OPERATOR_NAME")), true);
  assert.equal(placeholder.errors.some((value) => value.includes("PUBLIC_CONTACT_EMAIL")), true);
  assert.equal(placeholder.errors.some((value) => value.includes("PUBLIC_POLICY_EFFECTIVE_DATE")), true);
});

test("完整合规配置通过且公开读取不暴露无关服务端配置", () => {
  const env: NodeJS.ProcessEnv = { ...completeEnvironment(), REDIS_URL: "redis://secret", OPENAI_API_KEY: "CANARY_API_SECRET" };
  assert.equal(validateComplianceEnvironment(env).ok, true);
  const publicConfig = readPublicComplianceConfig(env);
  assert.equal(publicConfig.configured, true);
  assert.equal(publicConfig.operatorName, env.PUBLIC_OPERATOR_NAME);
  const serialized = JSON.stringify(publicConfig);
  assert.equal(serialized.includes("CANARY_API_SECRET"), false);
  assert.equal(serialized.includes("redis://secret"), false);
});

test("生产合规检查阻止开启不安全的服务器会话同步", () => {
  const result = validateComplianceEnvironment({
    ...completeEnvironment(),
    NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC: "true"
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((value) => value.includes("NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC")), true);
});

test("本机删除逻辑只删除项目业务 Key 并保留主题与无关数据", () => {
  const values = new Map<string, string>([
    ...PROJECT_BUSINESS_STORAGE_KEYS.map((key) => [key, "CANARY_PRIVATE_CONTENT"] as const),
    ["interview-lab-theme", "dark"],
    ["interview-lab-accent", "blue"],
    ["another-app.data", "keep-me"]
  ]);
  const result = clearProjectBusinessData({
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key); }
  });
  assert.deepEqual(result.failedKeys, []);
  assert.equal(result.removedKeys.length, PROJECT_BUSINESS_STORAGE_KEYS.length);
  for (const key of PROJECT_BUSINESS_STORAGE_KEYS) assert.equal(values.has(key), false);
  assert.equal(values.get("interview-lab-theme"), "dark");
  assert.equal(values.get("interview-lab-accent"), "blue");
  assert.equal(values.get("another-app.data"), "keep-me");
});
