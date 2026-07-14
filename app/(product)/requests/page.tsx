import type { Metadata } from "next";

import { RequestsEntry } from "@/components/requests/requests-entry";

export const metadata: Metadata = { title: "매뉴얼·답변 요청" };
export default function RequestsPage() { return <RequestsEntry />; }
