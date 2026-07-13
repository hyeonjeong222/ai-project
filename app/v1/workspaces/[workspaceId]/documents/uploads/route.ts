import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getServerEnv } from "@/lib/config/env";
import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { sanitizeFileName, validateDeclaredFile } from "@/lib/server/files";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  title: z.string().trim().min(1).max(500),
  category: z.string().trim().max(80).default(""),
  department: z.string().trim().max(120).default(""),
  effectiveDate: z.string().date().nullable().optional(),
  displayVersion: z.string().regex(/^[0-9]+\.[0-9]+$/).default("1.0"),
  description: z.string().trim().max(2000).default(""),
  isActive: z.boolean().default(true),
  fileName: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(200),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    z.string().uuid().parse(workspaceId);
    const user = await requireUser(request);
    await requireWorkspaceAdmin(workspaceId, user.id);
    const input = schema.parse(await request.json());
    const env = getServerEnv();
    const fileName = sanitizeFileName(input.fileName);
    validateDeclaredFile(fileName, input.contentType, input.byteSize, env.RAG_MAX_FILE_BYTES);

    const documentId = randomUUID();
    const versionId = randomUUID();
    const storagePath = `${workspaceId}/${documentId}/${versionId}/${fileName}`;
    const admin = createAdminClient();
    const { error: registerError } = await admin.rpc("register_document_upload_v2", {
      p_document_id: documentId,
      p_version_id: versionId,
      p_workspace_id: workspaceId,
      p_owner_id: user.id,
      p_title: input.title,
      p_tags: [...new Set(input.tags)],
      p_category: input.category,
      p_department: input.department,
      p_effective_date: input.effectiveDate ?? null,
      p_display_version: input.displayVersion,
      p_description: input.description,
      p_is_active: input.isActive,
      p_original_file_name: fileName,
      p_content_type: input.contentType,
      p_byte_size: input.byteSize,
      p_storage_object_path: storagePath,
      p_source_sha256: input.sha256,
      p_parser_version: "kordoc-2.9.1",
    });
    if (registerError) throw new ApiError(500, "DATABASE_ERROR", "업로드를 등록하지 못했습니다.");

    const { data: signed, error: signedError } = await admin.storage
      .from("knowledge-files")
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (signedError || !signed) {
      await admin.from("documents").delete().eq("id", documentId);
      throw new ApiError(500, "SIGNED_UPLOAD_ERROR", "업로드 URL을 만들지 못했습니다.");
    }

    return Response.json({
      documentId,
      versionId,
      upload: { url: signed.signedUrl, token: signed.token, path: storagePath },
      expiresIn: 120,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
