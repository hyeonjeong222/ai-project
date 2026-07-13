import { z } from "zod";

import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { getAuthorizedVersion } from "@/lib/server/documents";
import { errorResponse } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    z.string().uuid().parse(versionId);
    const user = await requireUser(request);
    const { version, document } = await getAuthorizedVersion(versionId, user.id);
    await requireWorkspaceAdmin(document.workspace_id, user.id);
    return Response.json({ document, version });
  } catch (error) {
    return errorResponse(error);
  }
}
