import { AccessClient } from "./access-client";
import { sanitizeInternalNextPath } from "../lib/beta-access/redirect";

type AccessPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  return <AccessClient nextPath={sanitizeInternalNextPath(rawNext)} initialServiceError={rawError === "service_unavailable"} />;
}
