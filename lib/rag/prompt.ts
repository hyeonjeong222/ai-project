import type { RetrievalHit } from "@/lib/rag/types";

export function escapePromptData(value: string) {
  return value
    .replaceAll("<", "＜")
    .replaceAll(">", "＞")
    .replaceAll("```", "`\u200b``")
    .replaceAll("~~~", "~\u200b~~");
}

export function buildChatPrompt(
  query: string,
  history: Array<{ role: string; content: string }>,
  evidence: RetrievalHit[],
) {
  const context = evidence.map((hit, index) => [
    `<evidence id="${index + 1}" chunk_id="${escapePromptData(hit.chunkId)}">`,
    `문서: ${escapePromptData(hit.documentTitle)}`,
    hit.sectionPath.length ? `섹션: ${escapePromptData(hit.sectionPath.join(" > "))}` : "",
    hit.pageStart ? `페이지: ${hit.pageStart}${hit.pageEnd && hit.pageEnd !== hit.pageStart ? `-${hit.pageEnd}` : ""}` : "",
    escapePromptData(hit.content),
    "</evidence>",
  ].filter(Boolean).join("\n")).join("\n\n");
  const conversation = history.slice(-6)
    .map((item) => `${escapePromptData(item.role)}: ${escapePromptData(item.content)}`)
    .join("\n");
  return `최근 대화:\n${conversation || "(없음)"}\n\n사용자 질문:\n${escapePromptData(query)}\n\n검색 근거:\n${context}`;
}
