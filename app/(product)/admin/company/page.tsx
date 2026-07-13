import type { Metadata } from "next";

import { CompanySettings } from "@/components/admin/company-settings";

export const metadata: Metadata = { title: "회사·구성원 관리" };
export default function CompanyPage() { return <CompanySettings />; }
