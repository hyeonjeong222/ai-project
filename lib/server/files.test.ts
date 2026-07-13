import { describe, expect, it } from "vitest";

import { sanitizeFileName, sha256Hex, validateMagicBytes } from "@/lib/server/files";

describe("file validation", () => {
  it("removes path traversal from uploaded file names", () => {
    expect(sanitizeFileName("../../인사규정.pdf")).toBe("인사규정.pdf");
  });

  it("validates PDF magic bytes", () => {
    expect(() => validateMagicBytes(new TextEncoder().encode("%PDF-1.7"), ".pdf")).not.toThrow();
    expect(() => validateMagicBytes(new TextEncoder().encode("not a pdf"), ".pdf")).toThrow();
  });

  it("calculates a stable SHA-256", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
