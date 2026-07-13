import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const metadata: Metadata = { title: "관리자 대시보드" };
export default function AdminPage() { return <AdminDashboard />; }
