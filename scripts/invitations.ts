import { loadEnvConfig } from "@next/env";
import { closeBetaRedisClient } from "../app/lib/beta-access/redis-client";
import { getBetaAccessService } from "../app/lib/beta-access/server";

loadEnvConfig(process.cwd());

function readOption(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label}必须是大于 0 的整数。`);
  return parsed;
}

function parseExpiration(args: string[]) {
  const expiresAt = readOption(args, "--expires-at");
  const expiresInDays = readOption(args, "--expires-in-days");
  if (expiresAt && expiresInDays) throw new Error("--expires-at 和 --expires-in-days 不能同时使用。");

  if (expiresAt) {
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed)) throw new Error("--expires-at 必须是有效的 ISO 日期时间。");
    return parsed;
  }

  if (expiresInDays) {
    const days = parsePositiveInteger(expiresInDays, 1, "有效天数");
    return Date.now() + days * 24 * 60 * 60 * 1000;
  }

  return null;
}

function formatDate(value: number | null) {
  return value === null ? "永不过期" : new Date(value).toISOString();
}

function displayStatus(invitation: { status: string; expires_at_ms: number | null; uses: number; max_uses: number }) {
  if (invitation.status !== "active") return invitation.status;
  if (invitation.expires_at_ms !== null && invitation.expires_at_ms <= Date.now()) return "expired";
  if (invitation.uses >= invitation.max_uses) return "used_up";
  return "active";
}

async function create(args: string[]) {
  const maxUses = parsePositiveInteger(readOption(args, "--max-uses"), 1, "最大使用次数");
  const result = await getBetaAccessService().createInvitation({
    expiresAtMs: parseExpiration(args),
    maxUses
  });

  console.log(`邀请码 ID：${result.invitation.invite_id}`);
  console.log(`有效期：${formatDate(result.invitation.expires_at_ms)}`);
  console.log(`最大使用次数：${result.invitation.max_uses}`);
  console.log("邀请码明文仅显示这一次，请通过安全渠道交付：");
  console.log(result.code);
}

async function list() {
  const invitations = await getBetaAccessService().listInvitations();
  if (!invitations.length) {
    console.log("暂无邀请码。");
    return;
  }

  console.table(
    invitations.map((invitation) => ({
      ID: invitation.invite_id,
      状态: displayStatus(invitation),
      使用次数: `${invitation.uses}/${invitation.max_uses}`,
      有效期: formatDate(invitation.expires_at_ms),
      创建时间: formatDate(invitation.created_at_ms)
    }))
  );
}

function requireInviteId(args: string[]) {
  const inviteId = args.find((argument) => !argument.startsWith("--"));
  if (!inviteId) throw new Error("请提供邀请码 ID。");
  return inviteId;
}

async function disable(args: string[]) {
  const inviteId = requireInviteId(args);
  const found = await getBetaAccessService().disableInvitation(inviteId);
  if (!found) throw new Error("未找到对应的邀请码 ID。");
  console.log(`已禁用邀请码：${inviteId}`);
  console.log("该邀请码关联的会话将在下一次鉴权时立即失效。");
}

async function revoke(args: string[]) {
  const inviteId = requireInviteId(args);
  const result = await getBetaAccessService().revokeInvitation(inviteId);
  if (!result.found) throw new Error("未找到对应的邀请码 ID。");
  console.log(`已撤销邀请码：${inviteId}`);
  console.log(`已使 ${result.revokedSessions} 个关联会话失效。`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "create") return create(args);
  if (command === "list") return list();
  if (command === "disable") return disable(args);
  if (command === "revoke") return revoke(args);
  throw new Error("支持的命令：create、list、disable、revoke。");
}

void main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "邀请码操作失败。";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBetaRedisClient();
  });
