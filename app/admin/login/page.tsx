import { AdminLoginClient } from "./admin-login-client";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string | string[] }> };

export default async function AdminLoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  return <AdminLoginClient initialUnavailable={error === "service_unavailable"} />;
}
