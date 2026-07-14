import { timingSafeEqual } from "node:crypto";

import { serverConfigStatus } from "@/lib/config/env";

export const dynamic = "force-dynamic";

function canViewConfig(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function GET(request: Request) {
  const config = serverConfigStatus();
  const ready = Object.values(config).every(Boolean);
  const status = ready ? "up" : "down";
  return Response.json(
    canViewConfig(request)
      ? { status, config, timestamp: new Date().toISOString() }
      : { status },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
