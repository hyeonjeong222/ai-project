import { serverConfigStatus } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export function GET() {
  const config = serverConfigStatus();
  const ready = Object.values(config).every(Boolean);
  return Response.json(
    { status: ready ? "ok" : "configuration_required", config, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
