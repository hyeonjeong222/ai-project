import type { Metadata } from "next";

import { QuestionAnalytics } from "@/components/admin/question-analytics";

export const metadata: Metadata = { title: "질문 통계" };
export default function Page() { return <QuestionAnalytics />; }
