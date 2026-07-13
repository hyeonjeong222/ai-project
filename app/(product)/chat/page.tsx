import type { Metadata } from "next";

import { ChatWorkspace } from "@/components/chat/chat-workspace";

export const metadata: Metadata = { title: "AI에게 질문" };

export default function ChatPage() {
  return <ChatWorkspace />;
}
