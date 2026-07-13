import { timingSafeEqual } from "node:crypto";

import { getServerEnv, hasOpenAIConfig } from "@/lib/config/env";
import { processPendingJobs } from "@/lib/rag/ingestion";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${getServerEnv().CRON_SECRET}`;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasOpenAIConfig()) {
    return Response.json(
      { error: { code: "OPENAI_NOT_CONFIGURED", message: "OpenAI API 키를 설정한 뒤 문서 분석을 실행할 수 있습니다." } },
      { status: 503 },
    );
  }
  try {
    const results = await processPendingJobs();
    return Response.json({ processed: results.length, results });
  } catch {
    return Response.json({ error: { code: "WORKER_RUN_FAILED", message: "워커 실행에 실패했습니다." } }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
