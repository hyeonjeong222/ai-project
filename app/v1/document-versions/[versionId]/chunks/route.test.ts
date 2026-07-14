import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" }),
}));
vi.mock("@/lib/server/documents", () => ({
  getAuthorizedVersion: vi.fn().mockResolvedValue({ membership: { role: "ADMIN" } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { GET } from "@/app/v1/document-versions/[versionId]/chunks/route";

const params = { params: Promise.resolve({ versionId: "00000000-0000-4000-8000-000000000002" }) };

describe("GET document chunks pagination", () => {
  it.each(["limit=abc", "offset=abc"])("returns 400 for %s", async (query) => {
    const response = await GET(new Request(`https://app.example.com/v1/document-versions/id/chunks?${query}`), params);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(payload)).not.toMatch(/limit|offset/);
  });
});
