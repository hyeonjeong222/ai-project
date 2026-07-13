import type { Metadata } from "next";

import { RequestInbox } from "@/components/admin/request-inbox";

export const metadata: Metadata = { title: "직원 문의함" };
export default function AdminRequestsPage() { return <RequestInbox />; }
