import { getServerEnv } from "@/lib/config/env";
import { adaptKordocBlocks } from "@/lib/rag/kordoc-adapter";
import { createStructuralChunks } from "@/lib/rag/chunking";
import { parseKordoc } from "@/lib/rag/kordoc";
import { embedTexts } from "@/lib/rag/openai";
import { sha256Hex } from "@/lib/server/files";
import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

interface ClaimedJob {
  job_id: string;
  attempts: number;
  version_id: string;
  document_id: string;
  workspace_id: string;
  storage_object_path: string;
  original_file_name: string;
  content_type: string;
  byte_size: number;
  source_sha256: string;
  document_title: string;
}

function parseError(result: unknown) {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
  return {
    code: typeof error.code === "string" ? error.code : "PARSE_FAILED",
    message: typeof error.message === "string" ? error.message : "문서를 파싱하지 못했습니다.",
  };
}

function isNeedsOcr(value: unknown) {
  const serialized = JSON.stringify(value).toUpperCase();
  return serialized.includes("NEEDSOCR") || serialized.includes("NEEDS_OCR") || serialized.includes("IMAGE_BASED_PDF");
}

function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown ingestion error";
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code : "INGESTION_FAILED";
  return { code, message: message.slice(0, 500), at: new Date().toISOString() };
}

function isRetryable(error: unknown) {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status === 429 || error.status >= 500;
  }
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return !["ENCRYPTED", "ZIP_BOMB", "IMAGE_BASED_PDF", "UNSUPPORTED_FORMAT", "HASH_MISMATCH"].includes(code);
}

function supabaseErrorMessage(action: string, error: SupabaseErrorLike) {
  const parts = [
    error.message,
    error.code ? `code=${error.code}` : undefined,
    error.details ? `details=${error.details}` : undefined,
    error.hint ? `hint=${error.hint}` : undefined,
  ].filter(Boolean);
  return `${action}: ${parts.join(" | ") || "Unknown Supabase error"}`;
}

async function setStage(jobId: string, status: "PARSING" | "CHUNKING" | "EMBEDDING") {
  const { error } = await createAdminClient().rpc("set_ingestion_stage", { p_job_id: jobId, p_status: status });
  if (error) throw new Error(supabaseErrorMessage(`Failed to set ingestion stage ${status}`, error));
}

export async function processClaimedJob(job: ClaimedJob) {
  const admin = createAdminClient();
  try {
    const { data: file, error: downloadError } = await admin.storage
      .from("knowledge-files")
      .download(job.storage_object_path);
    if (downloadError || !file) throw Object.assign(new Error("Stored document download failed"), { code: "DOWNLOAD_FAILED" });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== Number(job.byte_size) || sha256Hex(bytes) !== job.source_sha256) {
      throw Object.assign(new Error("Stored document checksum mismatch"), { code: "HASH_MISMATCH" });
    }

    await setStage(job.job_id, "PARSING");
    const exactBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const parsed = await parseKordoc(exactBuffer);
    if (!parsed.success) {
      const failure = parseError(parsed);
      throw Object.assign(new Error(failure.message), { code: failure.code });
    }
    if (isNeedsOcr(parsed.metadata) || isNeedsOcr(parsed.warnings)) {
      throw Object.assign(new Error("이미지 기반 PDF는 OCR 처리가 필요합니다."), { code: "IMAGE_BASED_PDF" });
    }

    await setStage(job.job_id, "CHUNKING");
    const blocks = await adaptKordocBlocks(parsed.blocks);
    const chunks = createStructuralChunks({
      workspaceId: job.workspace_id,
      documentTitle: job.document_title,
      blocks,
    });
    if (chunks.length === 0) throw Object.assign(new Error("검색 가능한 텍스트가 없습니다."), { code: "EMPTY_DOCUMENT" });

    await setStage(job.job_id, "EMBEDDING");
    const embeddings = await embedTexts(chunks.map((chunk) => chunk.embeddingText));
    const payload = chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));
    const totalPages = blocks.reduce((maximum, block) => Math.max(maximum, block.page ?? 0), 0) || null;
    const { error: completeError } = await admin.rpc("complete_document_ingestion", {
      p_job_id: job.job_id,
      p_chunks: payload,
      p_parse_metadata: parsed.metadata ?? {},
      p_parsing_warnings: parsed.warnings ?? [],
      p_total_pages: totalPages,
    });
    if (completeError) throw new Error(supabaseErrorMessage("Failed to commit indexed chunks", completeError));
    return { jobId: job.job_id, versionId: job.version_id, chunks: chunks.length, status: "READY" as const };
  } catch (error) {
    const failure = safeFailure(error);
    const needsOcr = failure.code === "IMAGE_BASED_PDF";
    const { error: failError } = await admin.rpc("fail_ingestion_job", {
      p_job_id: job.job_id,
      p_error: failure,
      p_retryable: isRetryable(error),
      p_needs_ocr: needsOcr,
    });
    if (failError) console.error(supabaseErrorMessage(`Failed to record ingestion failure ${job.job_id}`, failError));
    return { jobId: job.job_id, versionId: job.version_id, status: needsOcr ? "NEEDS_OCR" as const : "FAILED" as const };
  }
}

export async function processPendingJobs(limit = getServerEnv().RAG_WORKER_BATCH_SIZE) {
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const { data, error } = await createAdminClient().rpc("claim_ingestion_job", {
      p_worker_id: getServerEnv().RAG_WORKER_ID,
    });
    if (error) throw new Error(supabaseErrorMessage("Failed to claim ingestion job", error));
    const job = Array.isArray(data) ? data[0] as ClaimedJob | undefined : undefined;
    if (!job) break;
    results.push(await processClaimedJob(job));
  }
  return results;
}
