import { z } from "zod";

import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { getAuthorizedVersion } from "@/lib/server/documents";
import { errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const terminal = new Set(["READY", "FAILED", "NEEDS_OCR", "DELETED"]);
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    z.string().uuid().parse(versionId);
    const user = await requireUser(request);
    const { document } = await getAuthorizedVersion(versionId, user.id);
    await requireWorkspaceAdmin(document.workspace_id, user.id);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const admin = createAdminClient();
        let previous = "";
        try {
          for (let index = 0; index < 25 && !request.signal.aborted; index += 1) {
            const { data, error } = await admin
              .from("document_versions")
              .select("parse_status,total_chunks,parsing_warnings,processing_error,updated_at")
              .eq("id", versionId)
              .single();
            if (error) throw error;
            const serialized = JSON.stringify(data);
            if (serialized !== previous) {
              controller.enqueue(encoder.encode(`event: status\ndata: ${serialized}\n\n`));
              previous = serialized;
            } else {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
            }
            if (terminal.has(data.parse_status)) break;
            await delay(1000);
          }
        } catch {
          controller.enqueue(encoder.encode(`event: error\ndata: {"code":"STATUS_STREAM_ERROR"}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
