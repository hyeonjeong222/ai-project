import type { Metadata } from "next";
import { Suspense } from "react";

import { DocumentUpload } from "@/components/admin/document-upload";

export const metadata: Metadata = { title: "문서 업로드" };
export default function Page() {
  return <Suspense fallback={<main className="admin-page" aria-busy="true" />}><DocumentUpload /></Suspense>;
}
