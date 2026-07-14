import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

function configureReadyEnvironment() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key-long-enough");
  vi.stubEnv("OPENAI_API_KEY", "openai-test-key-long-enough");
  vi.stubEnv("CRON_SECRET", "12345678901234567890123456789012");
}

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("returns only opaque status to unauthenticated callers", async () => {
    configureReadyEnvironment();
    const response = GET(new Request("https://app.example.com/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "up" });
  });

  it("returns configuration booleans to an authorized operator", async () => {
    configureReadyEnvironment();
    const response = GET(new Request("https://app.example.com/api/health", {
      headers: { Authorization: "Bearer 12345678901234567890123456789012" },
    }));
    const payload = await response.json();
    expect(payload.status).toBe("up");
    expect(payload.config).toEqual({
      supabaseUrl: true,
      supabasePublishableKey: true,
      supabaseServiceRoleKey: true,
      openAiApiKey: true,
      cronSecret: true,
    });
  });
});
