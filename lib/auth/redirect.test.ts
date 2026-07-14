import { describe, expect, it } from "vitest";

import { sanitizeInternalRedirect } from "@/lib/auth/redirect";

const origin = "https://app.example.com";

describe("sanitizeInternalRedirect", () => {
  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)"])(
    "falls back for unsafe redirect %s",
    (value) => {
      expect(sanitizeInternalRedirect(value, origin)).toBe("/chat");
    },
  );

  it("preserves a same-origin path, query, and fragment", () => {
    expect(sanitizeInternalRedirect("/requests?state=open#latest", origin)).toBe("/requests?state=open#latest");
  });

  it("uses the caller fallback", () => {
    expect(sanitizeInternalRedirect(null, origin, "/admin")).toBe("/admin");
  });
});
