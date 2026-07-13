import { processPendingJobs } from "@/lib/rag/ingestion";

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  while (!stopping) {
    const results = await processPendingJobs();
    if (results.length === 0) await delay(2000);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Worker failed");
  process.exitCode = 1;
});
