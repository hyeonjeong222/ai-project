import type { Metadata } from "next";

import { DocumentsPage } from "@/components/admin/documents-page";

export const metadata: Metadata = { title: "문서 관리" };
export default function Page() { return <DocumentsPage />; }
