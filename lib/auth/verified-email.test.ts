import { describe, expect, it } from "vitest";

import { hasVerifiedEmail } from "@/lib/auth/verified-email";

describe("hasVerifiedEmail", () => {
  it("rejects an unconfirmed email", () => {
    expect(hasVerifiedEmail({ email: "invitee@example.com", email_confirmed_at: null })).toBe(false);
  });

  it("allows a confirmed email", () => {
    expect(hasVerifiedEmail({
      email: "invitee@example.com",
      email_confirmed_at: "2026-07-14T00:00:00.000Z",
    })).toBe(true);
  });
});
