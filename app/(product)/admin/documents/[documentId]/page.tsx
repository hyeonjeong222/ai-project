import type { Metadata } from "next";

import { DocumentDetail } from "@/components/admin/document-detail";

export const metadata: Metadata = { title: "문서 검수" };

export default async function Page({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return <DocumentDetail documentId={documentId} />;
}
