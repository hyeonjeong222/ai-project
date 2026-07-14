import { loadEnvConfig } from "@next/env";

// `next dev`와 달리 독립 실행되는 워커는 `.env.local`을 자동으로 읽지 않는다.
// 로컬/서버 워커 모두 웹 앱과 같은 환경변수를 사용하도록 먼저 로드한다.
loadEnvConfig(process.cwd());

import { processPendingJobs } from "@/lib/rag/ingestion";

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  while (!stopping) {
    const results = await processPendingJobs();
    if (results.length === 0) {
      await delay(2000);
      continue;
    }

    for (const result of results) {
      console.log(`[ingestion] ${result.versionId}: ${result.status}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Worker failed");
  process.exitCode = 1;
});
