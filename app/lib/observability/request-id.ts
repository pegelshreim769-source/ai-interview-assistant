import { randomUUID } from "node:crypto";

export function createServerRequestId() {
  return randomUUID();
}

export function withRequestId(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", requestId);
  if (response.status >= 400) headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
