import { getAdminService } from "../../../lib/admin/server";
import { requireAdminAccess } from "../../../lib/admin/api-auth";
import { getBetaUsageService } from "../../../lib/beta-usage/server";
import { getMetricsService } from "../../../lib/observability/server";
import type { AdminUsageResponse, MetricsRange } from "../../../lib/observability/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRange(request: Request): MetricsRange {
  const value = new URL(request.url).searchParams.get("range");
  return value === "today" || value === "7d" || value === "30d" ? value : "today";
}

export async function GET(request: Request) {
  let access;
  try {
    access = await requireAdminAccess(request, getAdminService());
  } catch {
    return Response.json(
      { error: "管理服务暂时不可用，请稍后再试。", code: "ADMIN_SERVICE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (access.status !== "authorized") return access.response;
  try {
    const [snapshot, budget] = await Promise.all([
      getMetricsService().snapshot(parseRange(request)),
      getBetaUsageService().readBudgetSnapshot()
    ]);
    const body: AdminUsageResponse = {
      ...snapshot,
      budget,
      tokenUsageAvailable: false,
      costNotice: "估算费用基于固定费用单位，不等于模型厂商实际账单。"
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "聚合指标暂时不可用，请稍后再试。", code: "ADMIN_USAGE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
