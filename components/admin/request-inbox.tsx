"use client";

import { CheckCircle2, ClipboardList, FilePlus2, MessageCircleQuestion, Send } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { PageError, PageLoading } from "@/components/admin/admin-dashboard";
import { useWorkspace } from "@/components/app/workspace-provider";
import { api } from "@/lib/client/api";

type RequestKind = "HUMAN_ANSWER" | "DOCUMENT_REQUEST";
type RequestStatus = "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";
interface SupportRequest {
  id: string; kind: RequestKind; subject: string; content: string; status: RequestStatus;
  response: string | null; created_at: string; updated_at: string;
  requester: { name: string; email: string } | null;
}
const labels: Record<RequestKind, string> = { HUMAN_ANSWER: "사람 답변", DOCUMENT_REQUEST: "문서 추가" };
const statuses: Record<RequestStatus, string> = { OPEN: "접수됨", IN_PROGRESS: "확인 중", ANSWERED: "답변 완료", CLOSED: "종료" };

export function RequestInbox() {
  const { workspace } = useWorkspace();
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState<RequestStatus>("OPEN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true); setError("");
    try {
      const data = await api<{ requests: SupportRequest[] }>(`/v1/workspaces/${workspace.id}/requests?scope=admin`);
      setRequests(data.requests);
      setSelectedId((current) => data.requests.some((item) => item.id === current) ? current : data.requests[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "문의함을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [workspace]);
  useEffect(() => { void load(); }, [load]);

  const selected = requests.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (selected) { setResponse(selected.response ?? ""); setStatus(selected.status); }
  }, [selected]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !selected) return;
    setSaving(true);
    try {
      await api(`/v1/workspaces/${workspace.id}/requests/${selected.id}`, {
        method: "PATCH", body: JSON.stringify({ status, response: response.trim() || undefined }),
      });
      await load();
    } finally { setSaving(false); }
  }

  if (loading && !requests.length) return <PageLoading label="직원 문의함을 불러오는 중입니다." />;
  if (error && !requests.length) return <PageError message={error} onRetry={() => load()} />;

  return <main className="admin-page request-inbox-page">
    <header className="page-header"><div><p className="eyebrow">MANUAL ADMIN DESK</p><h1>직원 문의함</h1><p>챗봇이 답하지 못한 질문은 직접 답변하고, 필요한 매뉴얼은 최신 문서로 보완하세요.</p></div></header>
    <section className="inbox-summary">
      <span><MessageCircleQuestion size={16} />사람 답변 요청 {requests.filter((item) => item.kind === "HUMAN_ANSWER" && item.status !== "ANSWERED").length}건</span>
      <span><FilePlus2 size={16} />문서 추가 요청 {requests.filter((item) => item.kind === "DOCUMENT_REQUEST" && item.status !== "CLOSED").length}건</span>
    </section>
    <section className="inbox-layout panel">
      <aside className="inbox-list"><header><strong>요청 목록</strong><span>{requests.length}</span></header>
        {requests.length === 0 ? <div className="request-empty"><ClipboardList size={25} /><strong>처리할 요청이 없습니다.</strong></div> : requests.map((item) => <button key={item.id} className={item.id === selectedId ? "active" : ""} onClick={() => setSelectedId(item.id)}>
          <div><span className={`request-kind ${item.kind.toLowerCase()}`}>{labels[item.kind]}</span><span className={`request-status ${item.status.toLowerCase()}`}>{statuses[item.status]}</span></div>
          <strong>{item.subject}</strong><small>{item.requester?.name ?? "구성원"} · {new Date(item.updated_at).toLocaleDateString("ko-KR")}</small>
        </button>)}
      </aside>
      <article className="inbox-detail">{selected ? <>
        <header className="detail-user"><span className="history-avatar large">{selected.requester?.name.slice(0, 1) ?? "U"}</span><div><h2>{selected.requester?.name ?? "구성원"}</h2><p>{selected.requester?.email} · {new Date(selected.created_at).toLocaleString("ko-KR")}</p></div><span className={`request-kind ${selected.kind.toLowerCase()}`}>{labels[selected.kind]}</span></header>
        <section className="request-original"><p className="eyebrow">REQUEST</p><h3>{selected.subject}</h3><p>{selected.content}</p></section>
        <form className="admin-response-form" onSubmit={save}>
          <label className="field-label">처리 상태<select value={status} onChange={(event) => setStatus(event.target.value as RequestStatus)}><option value="OPEN">접수됨</option><option value="IN_PROGRESS">확인 중</option><option value="ANSWERED">답변 완료</option><option value="CLOSED">종료</option></select></label>
          <label className="field-label">직원에게 보낼 답변<textarea rows={7} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="직원이 바로 확인할 수 있도록 사실과 다음 행동을 명확히 적어 주세요." /></label>
          <div className="response-actions"><p>{status === "ANSWERED" ? "답변 완료로 처리하면 직원의 ‘내 요청’ 화면에 바로 표시됩니다." : "답변 없이도 상태만 변경할 수 있습니다."}</p><button className="button primary" disabled={saving || (status === "ANSWERED" && !response.trim())}><Send size={16} />{saving ? "저장 중…" : status === "ANSWERED" ? "답변 보내기" : "상태 저장"}</button></div>
        </form>
        {selected.response && <div className="previous-response"><CheckCircle2 size={16} /><span>이 요청에는 이미 답변이 등록되어 있습니다. 내용을 수정하면 최신 답변으로 갱신됩니다.</span></div>}
      </> : <div className="detail-empty"><ClipboardList size={30} /><strong>처리할 요청을 선택해 주세요.</strong></div>}</article>
    </section>
  </main>;
}
