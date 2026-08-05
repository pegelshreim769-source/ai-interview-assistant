import { loadEnvConfig } from "@next/env";
import { validateComplianceEnvironment } from "../app/lib/compliance/config";

loadEnvConfig(process.cwd());

const result = validateComplianceEnvironment(process.env);
if (!result.ok) {
  console.error("生产合规配置检查未通过：");
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("生产合规配置检查通过。公开运营信息已配置，服务器会话同步保持关闭。" );
}
