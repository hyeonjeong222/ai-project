import type { Metadata } from "next";

import { RequestCenter } from "@/components/requests/request-center";

export const metadata: Metadata = { title: "매뉴얼·답변 요청" };
export default function RequestsPage() { return <RequestCenter />; }
