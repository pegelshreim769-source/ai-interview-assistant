import { loadEnvConfig } from "@next/env";

import { closeBetaRedisClient } from "../app/lib/beta-access/redis-client";
import { getAdminService } from "../app/lib/admin/server";
import { createAdminAccessToken, hashAdminSecret } from "../app/lib/admin/tokens";

loadEnvConfig(process.cwd());

async function main() {
  const command = process.argv[2];
  if (command === "token-create") {
    const token = createAdminAccessToken();
    console.log("管理员访问令牌明文仅显示一次，请通过安全渠道保存：");
    console.log(token);
    console.log("请写入服务端环境变量的 SHA-256 哈希：");
    console.log(`ADMIN_ACCESS_TOKEN_HASH=${hashAdminSecret(token)}`);
    return;
  }
  if (command === "sessions-revoke") {
    const count = await getAdminService().revokeAllSessions();
    console.log(`已撤销 ${count} 个当前管理员令牌关联的会话。`);
    return;
  }
  throw new Error("支持的命令：token-create、sessions-revoke。");
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "管理员操作失败。");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBetaRedisClient();
  });
