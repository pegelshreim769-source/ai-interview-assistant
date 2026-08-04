export function sanitizeInternalNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const parsed = new URL(value, "https://interview-studio.local");
    if (parsed.origin !== "https://interview-studio.local") return "/";
    const decodedPathname = decodeURIComponent(parsed.pathname);
    if (decodedPathname.startsWith("//") || decodedPathname.includes("\\")) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
