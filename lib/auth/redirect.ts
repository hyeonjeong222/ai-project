const DEFAULT_REDIRECT_PATH = "/chat";

export function sanitizeInternalRedirect(
  value: string | null | undefined,
  origin: string,
  fallback = DEFAULT_REDIRECT_PATH,
) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  try {
    const base = new URL(origin);
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
