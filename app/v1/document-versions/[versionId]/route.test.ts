import { describe, expect, it, vi } from "vitest";

const { requireWorkspaceAdmin } = vi.hoisted(() => ({
  requireWorkspaceAdmin: vi.fn().mockResolvedValue({ role: "ADMIN" }),
}));
vi.mock("@/lib/server/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" }),
  requireWorkspaceAdmin,
}));
vi.mock("@/lib/server/documents", () => ({
  getAuthorizedVersion: vi.fn().mockResolvedValue({
    version: { id: "00000000-0000-4000-8000-000000000002", parse_status: "READY" },
    document: { id: "00000000-0000-4000-8000-000000000003", workspace_id: "00000000-0000-4000-8000-000000000004" },
  }),
}));

import { GET } from "@/app/v1/document-versions/[versionId]/route";

describe("GET document version contract", () => {
  it("returns the authorized document and version", async () => {
    const response = await GET(
      new Request("https://app.example.com/v1/document-versions/00000000-0000-4000-8000-000000000002"),
      { params: Promise.resolve({ versionId: "00000000-0000-4000-8000-000000000002" }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.version.parse_status).toBe("READY");
    expect(requireWorkspaceAdmin).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000001");
  });
});
