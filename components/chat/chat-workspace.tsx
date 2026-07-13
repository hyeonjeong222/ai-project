"use client";

import { ArrowRight, Bot, Check, ClipboardPlus, Menu, MessageSquarePlus, PanelLeftClose, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useWorkspace } from "@/components/app/workspace-provider";
import { api } from "@/lib/client/api";

interface Thread { id: string; title: string | null; updated_at: string; messageCount: number; preview: string }
interface Citation { chunkId: string; documentId: string; documentTitle: string; pageStart: number | null; pageEnd: number | null; sectionPath: string[]; preview: string; sourceUrl: string }
interface Message { id: string; role: "USER" | "ASSISTANT"; content: string; citations: Citation[]; feedback: 1 | -1 | null; pending?: boolean }

const suggestions = [
  ["연차·휴가", "연차는 며칠 전에 신청해야 하나요?"],
  ["법인카드", "법인카드는 어떤 경우에 사용할 수 있나요?"],
  ["출장·정산", "출장비 정산 절차와 기한을 알려주세요."],
  ["재택근무", "재택근무 신청 기준이 있나요?"],
];

function formatRelative(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function ChatWorkspace() {
  const { workspace } = useWorkspace();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "streaming" | "error">("loading");
  const [error, setError] = useState("");
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    if (!workspace) return;
    const data = await api<{ threads: Thread[] }>(`/v1/chat/threads?workspaceId=${workspace.id}`);
    setThreads(data.threads);
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    setStatus("loading");
    setActiveThreadId(null);
    setMessages([]);
    loadThreads().catch(() => setError("대화 환경을 불러오지 못했습니다.")).finally(() => setStatus("idle"));
  }, [workspace, loadThreads]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  async function selectThread(threadId: string) {
    setStatus("loading");
    setActiveThreadId(threadId);
    setSessionsOpen(false);
    try {
      const data = await api<{ messages: Message[] }>(`/v1/chat/threads/${threadId}/messages`);
      setMessages(data.messages);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "대화를 불러오지 못했습니다.");
    } finally { setStatus("idle"); }
  }

  function newChat() {
    setActiveThreadId(null);
    setMessages([]);
    setError("");
    setSessionsOpen(false);
  }

  function applyStreamEvent(eventName: string, payload: unknown, tempId: string) {
    const data = payload as Record<string, unknown>;
    if (eventName === "token") {
      const delta = typeof data.delta === "string" ? data.delta : "";
      setMessages((current) => current.map((message) => message.id === tempId ? { ...message, content: message.content + delta } : message));
    } else if (eventName === "citation") {
      setMessages((current) => current.map((message) => message.id === tempId ? { ...message, citations: [...message.citations, data as unknown as Citation] } : message));
    } else if (eventName === "done") {
      const id = typeof data.messageId === "string" ? data.messageId : tempId;
      setMessages((current) => current.map((message) => message.id === tempId ? { ...message, id, pending: false } : message));
    } else if (eventName === "error") {
      throw new Error(typeof data.message === "string" ? data.message : "답변 생성에 실패했습니다.");
    }
  }

  async function sendQuestion(rawQuestion: string) {
    const content = rawQuestion.trim();
    if (!content || !workspace || status === "streaming") return;
    setStatus("streaming");
    setError("");
    setQuestion("");
    let threadId = activeThreadId;
    try {
      if (!threadId) {
        const created = await api<{ thread: Thread }>("/v1/chat/threads", {
          method: "POST",
          body: JSON.stringify({ workspaceId: workspace.id, title: content.slice(0, 40) }),
        });
        threadId = created.thread.id;
        setActiveThreadId(threadId);
      }
      const tempId = `stream-${Date.now()}`;
      setMessages((current) => [...current,
        { id: `user-${Date.now()}`, role: "USER", content, citations: [], feedback: null },
        { id: tempId, role: "ASSISTANT", content: "", citations: [], feedback: null, pending: true },
      ]);
      const response = await fetch(`/v1/chat/threads/${threadId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, documentIds: [] }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "답변 스트림을 시작하지 못했습니다.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const eventName = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
          const dataLine = block.match(/^data:\s*(.+)$/m)?.[1];
          if (eventName && dataLine) applyStreamEvent(eventName, JSON.parse(dataLine), tempId);
        }
        if (done) break;
      }
      setStatus("idle");
      await loadThreads();
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "답변 생성 중 오류가 발생했습니다.");
      setMessages((current) => current.filter((message) => !message.pending));
    }
  }

  async function rateMessage(message: Message, feedback: 1 | -1) {
    const next = message.feedback === feedback ? null : feedback;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, feedback: next } : item));
    try {
      await api(`/v1/chat/messages/${message.id}/feedback`, { method: "PATCH", body: JSON.stringify({ feedback: next }) });
    } catch { setMessages((current) => current.map((item) => item.id === message.id ? { ...item, feedback: message.feedback } : item)); }
  }

  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  return (
    <main className="chat-workspace">
      <aside className={`thread-rail ${sessionsOpen ? "open" : ""}`}>
        <div className="thread-rail-header"><div><p className="eyebrow">CONVERSATIONS</p><h2>내 대화</h2></div><button className="icon-button" onClick={() => setSessionsOpen(false)} aria-label="대화 목록 닫기"><PanelLeftClose size={18} /></button></div>
        <button className="button primary wide" onClick={newChat}><MessageSquarePlus size={17} />새 대화</button>
        <div className="thread-list">
          {threads.length === 0 && <p className="empty-note">아직 저장된 대화가 없습니다.</p>}
          {threads.map((thread) => <button key={thread.id} className={`thread-item ${thread.id === activeThreadId ? "active" : ""}`} onClick={() => selectThread(thread.id)}><strong>{thread.title || "제목 없는 대화"}</strong><span>{thread.preview || "새 대화"}</span><small>{formatRelative(thread.updated_at)} · {thread.messageCount}개</small></button>)}
        </div>
      </aside>

      <section className="chat-stage">
        <header className="page-topbar chat-topbar">
          <div className="topbar-title"><button className="icon-button thread-menu-button" onClick={() => setSessionsOpen(true)} aria-label="대화 목록 열기"><Menu size={19} /></button><div><p className="eyebrow">EMPLOYEE ASSISTANT</p><h1>{activeThread?.title || "새 대화"}</h1></div></div>
          <Link className="button secondary request-link" href="/requests"><ClipboardPlus size={16} />문의 요청</Link>
        </header>

        <div className="message-viewport" ref={listRef}>
          {messages.length === 0 && status !== "loading" ? (
            <div className="chat-welcome"><div className="welcome-orb"><Sparkles size={26} /></div><p className="eyebrow">SECURE EMPLOYEE ASSISTANT</p><h2>무엇을 확인해 드릴까요?</h2><p>등록된 매뉴얼을 기준으로 답합니다. 매뉴얼에 없는 내용은 담당자에게 직접 답변이나 문서 추가를 요청할 수 있습니다.</p><div className="suggestion-grid">{suggestions.map(([label, text]) => <button key={text} onClick={() => sendQuestion(text)}><span>{label}</span><strong>{text}</strong><ArrowRight size={17} /></button>)}</div><div className="ready-note"><Check size={15} />매뉴얼 원문은 관리 담당자만 열람할 수 있습니다.</div></div>
          ) : (
            <div className="messages-inner">
              {messages.map((message) => message.role === "USER" ? (
                <article key={message.id} className="message-row user"><div className="message-bubble user">{message.content}</div></article>
              ) : (
                <article key={message.id} className="message-row assistant"><div className="assistant-avatar"><Bot size={17} /></div><div className="assistant-stack"><div className={`message-bubble assistant ${message.pending ? "streaming" : ""}`}>{message.content || <span className="thinking"><i /><i /><i /></span>}</div>{message.citations.length > 0 && <div className="citation-stack">{message.citations.map((citation, index) => <div key={citation.chunkId} className="citation-safe"><span className="citation-index">{index + 1}</span><span><strong>{citation.documentTitle}</strong><small>{citation.sectionPath.join(" › ") || "매뉴얼 근거"}{citation.pageStart ? ` · ${citation.pageStart}p` : ""}</small></span></div>)}</div>}{!message.pending && message.citations.length === 0 && <Link className="human-answer-link" href="/requests">답변이 부족한가요? 담당자에게 직접 답변 요청</Link>}{!message.pending && message.id.startsWith("stream-") === false && <div className="answer-actions"><span>도움이 되었나요?</span><button className={message.feedback === 1 ? "selected" : ""} onClick={() => rateMessage(message, 1)} aria-label="도움이 됐어요"><ThumbsUp size={14} /></button><button className={message.feedback === -1 ? "selected negative" : ""} onClick={() => rateMessage(message, -1)} aria-label="개선이 필요해요"><ThumbsDown size={14} /></button></div>}</div></article>
              ))}
              {status === "loading" && <div className="inline-loading"><span className="spinner" />대화를 불러오는 중…</div>}
              {status === "error" && <div className="chat-error"><strong>AI가 답변을 이어가지 못했습니다.</strong><span>{error}</span><div><Link href="/requests">담당자에게 답변 요청</Link><button onClick={() => setStatus("idle")}>닫기</button></div></div>}
            </div>
          )}
        </div>

        <form className="chat-composer" onSubmit={(event: FormEvent) => { event.preventDefault(); void sendQuestion(question); }}><div className="composer-inner"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="사내 규정이나 업무 절차를 질문하세요" rows={1} maxLength={1000} /><button disabled={!question.trim() || status === "streaming"} aria-label="질문 전송"><Send size={18} /></button></div><div className="composer-meta"><span><Sparkles size={13} />등록된 매뉴얼을 기준으로 답합니다.</span><span>{question.length}/1,000</span></div></form>
      </section>
    </main>
  );
}
