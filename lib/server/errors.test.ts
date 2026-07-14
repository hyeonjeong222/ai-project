import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError, errorResponse } from "@/lib/server/errors";

describe("errorResponse", () => {
  it("does not expose arbitrary ApiError details", async () => {
    const response = errorResponse(new ApiError(500, "DATABASE_ERROR", "실패", {
      table: "secret_table",
      hint: "internal query",
    }));
    expect(await response.json()).toEqual({ error: { code: "DATABASE_ERROR", message: "실패" } });
  });

  it("only exposes whitelisted rate-limit details", async () => {
    const response = errorResponse(new ApiError(429, "CHAT_RATE_LIMITED", "잠시 후 다시 시도", {
      retryAfterSeconds: 12,
      internalKey: "hidden",
    }));
    expect(await response.json()).toEqual({
      error: {
        code: "CHAT_RATE_LIMITED",
        message: "잠시 후 다시 시도",
        details: { retryAfterSeconds: 12 },
      },
    });
  });

  it("summarizes Zod errors without exposing field names", async () => {
    const error = z.object({ privateField: z.string().uuid() }).safeParse({ privateField: "bad" });
    if (error.success) throw new Error("Expected validation to fail");
    const payload = await errorResponse(error.error).json();
    expect(payload.error.details).toEqual({ issueCount: 1 });
    expect(JSON.stringify(payload)).not.toContain("privateField");
  });
});
