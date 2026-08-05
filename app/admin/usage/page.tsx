import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_SESSION_COOKIE } from "../../lib/admin/cookies";
import { getAdminService } from "../../lib/admin/server";
import { AdminUsageClient } from "./admin-usage-client";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value || "";
  if (!token) redirect("/admin/login");
  let valid = false;
  try {
    const result = await getAdminService().validateSession(token);
    valid = result.status === "valid";
  } catch {
    redirect("/admin/login?error=service_unavailable");
  }
  if (!valid) redirect("/admin/login");
  return <AdminUsageClient />;
}
