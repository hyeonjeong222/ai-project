import { z } from "zod";

import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  category: z.string().trim().max(80).optional(),
  department: z.string().trim().max(120).optional(),
  effectiveDate: z.string().date().nullable().optional(),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
  archived: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    z.string().uuid().parse(documentId);
    const user = await requireUser(request);
    const admin = createAdminClient();
    const { data: document, error } = await admin.from("documents")
      .select("id,workspace_id,title,tags,category,department,effective_date,display_version,description,is_active,archived_at,created_at,updated_at")
      .eq("id", documentId).maybeSingle();
    if (error || !document || document.archived_at) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "문서를 찾을 수 없습니다.");
    await requireWorkspaceAdmin(document.workspace_id, user.id);
    const { data: versions, error: versionsError } = await admin.from("document_versions")
      .select("id,document_id,version_number,display_version,replaces_version_id,is_current,original_file_name,content_type,byte_size,parse_status,processing_error,total_pages,total_chunks,indexed_at,created_at,updated_at")
      .eq("document_id", documentId).order("version_number", { ascending: false });
    if (versionsError) throw new ApiError(500, "DATABASE_ERROR", "문서 버전을 조회하지 못했습니다.");
    return Response.json({ document, versions: versions ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    z.string().uuid().parse(documentId);
    const user = await requireUser(request);
    const admin = createAdminClient();
    const { data: document, error: findError } = await admin
      .from("documents")
      .select("id,workspace_id")
      .eq("id", documentId)
      .maybeSingle();
    if (findError || !document) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "문서를 찾을 수 없습니다.");
    await requireWorkspaceAdmin(document.workspace_id, user.id);
    const input = schema.parse(await request.json());
    const updates: {
      title?: string; category?: string | null; department?: string | null; effective_date?: string | null;
      description?: string; is_active?: boolean; archived_at?: string | null;
    } = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.category !== undefined) updates.category = input.category || null;
    if (input.department !== undefined) updates.department = input.department || null;
    if (input.effectiveDate !== undefined) updates.effective_date = input.effectiveDate;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isActive !== undefined) updates.is_active = input.isActive;
    if (input.archived !== undefined) updates.archived_at = input.archived ? new Date().toISOString() : null;
    const { data, error } = await admin.from("documents").update(updates).eq("id", documentId)
      .select("id,is_active,archived_at,updated_at").single();
    if (error) throw new ApiError(500, "DATABASE_ERROR", "문서 상태를 변경하지 못했습니다.");
    return Response.json({ document: data });
  } catch (error) {
    return errorResponse(error);
  }
}
