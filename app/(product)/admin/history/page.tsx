import type { Metadata } from "next";

import { ChatHistory } from "@/components/admin/chat-history";

export const metadata: Metadata = { title: "채팅 기록" };
export default function Page() { return <ChatHistory />; }
