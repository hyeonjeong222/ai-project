"use client";

import { ArrowLeft, Check, ChevronDown, FilePlus2, FileText, GitBranch, RotateCcw, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";

import { useWorkspace } from "@/components/app/workspace-provider";
import { api } from "@/lib/client/api";
import type { ProductDocument } from "@/lib/client/product-types";

const categories = ["인사·휴가", "비용·정산", "법인카드", "재택근무", "출장", "보안", "IT·시스템", "기타"];
const allowed = [".hwp", ".hwpx", ".hwpml", ".pdf", ".xls", ".xlsx", ".docx"];
const maxFileBytes = 200 * 1024 * 1024;
const maxFileLabel = "200MB";
const mimeByExtension: Record<string, string> = {
  ".hwp": "application/x-hwp", ".hwpx": "application/hwp+zip", ".hwpml": "application/xml", ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const progressByStatus: Record<string, number> = { UPLOADING: 15, QUEUED: 35, PARSING: 50, CHUNKING: 67, EMBEDDING: 84, READY: 100 };
const labelByStatus: Record<string, string> = { UPLOADING: "원본 파일 업로드", QUEUED: "문서 분석 대기", PARSING: "텍스트와 표 추출", CHUNKING: "문서 구조 분석", EMBEDDING: "검색 데이터 생성", READY: "등록 완료" };
type UploadMode = "choose" | "new" | "replace";
type DocumentForm = { title: string; category: string; department: string; effectiveDate: string; displayVersion: string; description: string; isActive: boolean };
const emptyForm: DocumentForm = { title: "", category: "", department: "", effectiveDate: "", displayVersion: "1.0", description: "", isActive: true };

function extensionOf(name: string) { return `.${name.split(".").pop()?.toLowerCase()}`; }
function nextVersion(value: string) { const [major, minor] = value.split(".").map(Number); return Number.isFinite(major) && Number.isFinite(minor) ? `${major}.${minor + 1}` : "1.1"; }
function sizeLabel(value: number) { return value < 1024 * 1024 ? `${(value / 1024).toFixed(0)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
async function sha256(file: File) { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }

export function DocumentUpload() {
  const { workspace } = useWorkspace();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("replace");
  const [mode, setMode] = useState<UploadMode>(preselectedId ? "replace" : "choose");
  const [replacementId, setReplacementId] = useState(preselectedId ?? "");
  const [documents, setDocuments] = useState<ProductDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [form, setForm] = useState<DocumentForm>(emptyForm);
  const inputRef = useRef<HTMLInputElement>(null);
  const isReplacement = mode === "replace";

  useEffect(() => {
    if (!workspace) return;
    void api<{ documents: ProductDocument[] }>(`/v1/workspaces/${workspace.id}/documents`).then((data) => setDocuments(data.documents)).catch(() => undefined);
  }, [workspace]);

  useEffect(() => {
    if (!replacementId) return;
    void (async () => {
      try {
        const data = await api<{ document: ProductDocument }>(`/v1/documents/${replacementId}`);
        const document = data.document;
        setForm({ title: document.title, category: document.category ?? "", department: document.department ?? "", effectiveDate: document.effective_date ?? "", displayVersion: nextVersion(document.display_version), description: document.description, isActive: document.is_active });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "기존 문서 정보를 불러오지 못했습니다."); }
    })();
  }, [replacementId]);

  function chooseFile(next?: File) {
    if (!next) return;
    const extension = extensionOf(next.name);
    if (!allowed.includes(extension)) { setError("HWP, HWPX, HWPML, PDF, XLS, XLSX, DOCX 파일만 등록할 수 있습니다."); return; }
    if (next.size > maxFileBytes) { setError(`파일 크기는 ${maxFileLabel} 이하여야 합니다.`); return; }
    setFile(next); setError("");
    if (!form.title) setForm((current) => ({ ...current, title: next.name.replace(/\.[^.]+$/, "") }));
  }

  function waitForReady(versionId: string) {
    return new Promise<void>((resolve, reject) => {
      const events = new EventSource(`/v1/document-versions/${versionId}/events`, { withCredentials: true });
      const timer = window.setTimeout(() => { events.close(); reject(new Error("문서 처리가 오래 걸리고 있습니다. 문서 목록에서 상태를 확인해 주세요.")); }, 5 * 60 * 1000);
      events.addEventListener("status", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { parse_status: string; processing_error?: { message?: string } };
        setStatus(payload.parse_status);
        if (payload.parse_status === "READY") { window.clearTimeout(timer); events.close(); resolve(); }
        if (payload.parse_status === "FAILED" || payload.parse_status === "NEEDS_OCR") { window.clearTimeout(timer); events.close(); reject(new Error(payload.processing_error?.message ?? (payload.parse_status === "NEEDS_OCR" ? "이미지 PDF는 OCR 처리가 필요합니다." : "문서 처리에 실패했습니다."))); }
      });
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !file || status) return;
    if (!form.title.trim()) { setError("파일명과 다른 제목이 필요하다면 제목만 입력해 주세요."); return; }
    if (isReplacement && !replacementId) { setError("최신본으로 교체할 기존 매뉴얼을 선택해 주세요."); return; }
    setError(""); setStatus("UPLOADING");
    let pendingVersionId = "";
    let uploadFinished = false;
    try {
      const contentType = mimeByExtension[extensionOf(file.name)] ?? file.type;
      const checksum = await sha256(file);
      const endpoint = isReplacement ? `/v1/documents/${replacementId}/versions/uploads` : `/v1/workspaces/${workspace.id}/documents/uploads`;
      const registered = await api<{ versionId: string; upload: { url: string; path: string; token: string } }>(endpoint, { method: "POST", body: JSON.stringify({ ...form, fileName: file.name, contentType, byteSize: file.size, sha256: checksum, tags: [form.category, form.department].filter(Boolean), effectiveDate: form.effectiveDate || null }) });
      pendingVersionId = registered.versionId;
      const uploadBody = new FormData();
      uploadBody.append("cacheControl", "3600");
      uploadBody.append("", file);
      const uploadResponse = await fetch(registered.upload.url, { method: "PUT", headers: { "x-upsert": "false" }, body: uploadBody });
      if (!uploadResponse.ok) {
        const detail = (await uploadResponse.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 260);
        throw new Error(`원본 파일 전송에 실패했습니다. (${uploadResponse.status}${detail ? `: ${detail}` : ""})`);
      }
      uploadFinished = true;
      setStatus("QUEUED");
      await api(`/v1/document-versions/${registered.versionId}/complete`, { method: "POST", body: "{}" });
      await waitForReady(registered.versionId);
      setComplete(true);
    } catch (cause) {
      if (pendingVersionId && !uploadFinished) void api(`/v1/document-versions/${pendingVersionId}/uploads`, { method: "DELETE" }).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "문서 등록에 실패했습니다."); setStatus("");
    }
  }

  function reset() { setMode("choose"); setReplacementId(""); setFile(null); setStatus(""); setComplete(false); setForm(emptyForm); }

  if (complete) return <div className="admin-page"><div className="completion-card"><div className="completion-icon"><Check size={28} /></div><p className="eyebrow">DOCUMENT READY</p><h1>{isReplacement ? "최신 매뉴얼이 답변 준비를 마쳤습니다" : "새 매뉴얼이 답변 준비를 마쳤습니다"}</h1><p>{isReplacement ? "새 버전이 준비된 뒤 이전 버전은 자동으로 검색 대상에서 제외됐습니다." : "문서 전체를 구조 분석하고 검색 데이터로 변환했습니다. 이제 직원 질문의 근거로 사용됩니다."}</p><div><Link href="/admin/documents" className="button primary">문서 목록 보기</Link><button className="button secondary" onClick={reset}><RotateCcw size={16} />다른 매뉴얼 등록</button></div></div></div>;

  if (status) {
    const steps = ["UPLOADING", "QUEUED", "PARSING", "CHUNKING", "EMBEDDING", "READY"]; const currentIndex = steps.indexOf(status);
    return <div className="admin-page"><header className="page-header"><div><p className="eyebrow">DOCUMENT INGESTION</p><h1>문서를 지식으로 변환하고 있습니다</h1><p>브라우저를 닫아도 서버에서 안전하게 처리가 이어집니다.</p></div></header><section className="panel progress-card"><div className="progress-heading"><div><span className="spinner" /><div><p>현재 단계</p><h2>{labelByStatus[status] ?? status}</h2></div></div><strong>{progressByStatus[status] ?? 0}%</strong></div><div className="progress-track"><span style={{ width: `${progressByStatus[status] ?? 0}%` }} /></div><ol className="ingestion-steps">{steps.map((step, index) => <li className={index < currentIndex ? "done" : index === currentIndex ? "current" : ""} key={step}><span>{index < currentIndex ? <Check size={14} /> : index + 1}</span><div><strong>{labelByStatus[step]}</strong><small>{index < currentIndex ? "완료" : index === currentIndex ? "진행 중" : "대기"}</small></div></li>)}</ol></section></div>;
  }

  if (mode === "choose") return <main className="admin-page upload-choice-page"><header className="page-header"><div><p className="eyebrow">MANUAL FILE UPLOAD</p><h1>어떤 작업이 필요한가요?</h1><p>문서 내부 항목을 입력하지 않아도 됩니다. 매뉴얼 파일 전체를 올리면 제목·섹션·페이지 구조를 분석해 답변 근거로 사용합니다.</p></div><Link href="/admin/documents" className="button secondary"><ArrowLeft size={16} />문서 목록</Link></header><section className="upload-mode-grid"><button type="button" className="panel upload-mode-card" onClick={() => { setMode("new"); setForm(emptyForm); }}><span className="upload-mode-icon"><FilePlus2 size={25} /></span><p className="eyebrow">NEW MANUAL</p><h2>새 매뉴얼 등록</h2><p>신규 규정, 가이드, 온보딩 자료처럼 처음 등록하는 문서 파일을 올립니다.</p><strong>파일 선택으로 시작 <ChevronDown size={15} /></strong></button><button type="button" className="panel upload-mode-card" onClick={() => setMode("replace")}><span className="upload-mode-icon replace"><GitBranch size={25} /></span><p className="eyebrow">UPDATE EXISTING</p><h2>기존 매뉴얼 최신본 교체</h2><p>개정된 전체 파일을 올리면 이전 버전은 새 버전이 준비될 때까지 계속 사용됩니다.</p><strong>기존 매뉴얼 선택 <ChevronDown size={15} /></strong></button></section><section className="upload-choice-note panel"><Check size={17} /><p><strong>안전한 버전 전환</strong> — 최신본 분석이 끝난 뒤에만 검색 대상이 바뀌므로, 업데이트 중에도 직원의 AI 답변은 중단되지 않습니다.</p></section></main>;

  const selectedDocument = documents.find((document) => document.id === replacementId);
  return <div className="admin-page"><header className="page-header"><div><p className="eyebrow">{isReplacement ? "UPDATE EXISTING MANUAL" : "NEW MANUAL"}</p><h1>{isReplacement ? "기존 매뉴얼 최신본 교체" : "새 매뉴얼 파일 등록"}</h1><p>{isReplacement ? "개정된 전체 파일만 올리면 됩니다. 새 버전이 준비될 때까지 기존 답변은 안전하게 유지됩니다." : "파일을 먼저 올리고, 필요할 때만 매뉴얼 관리 정보를 보완하세요."}</p></div><button className="button secondary" onClick={reset}><ArrowLeft size={16} />작업 선택으로</button></header>
    <form className="upload-layout file-first-layout" onSubmit={submit}><div className="upload-main">{isReplacement && <section className="panel replacement-picker"><div><p className="eyebrow">STEP 01</p><h2>교체할 매뉴얼 선택</h2><p>선택한 매뉴얼의 제목·분류·담당 정보는 그대로 이어집니다.</p></div><label className="field-label"><select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">기존 매뉴얼을 선택해 주세요</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title} · v{document.display_version}</option>)}</select></label>{documents.length === 0 && <p className="form-alert error">교체할 매뉴얼이 없습니다. 새 매뉴얼 등록을 사용해 주세요.</p>}</section>}
      <section className="panel form-section file-first-section"><div className="section-heading"><span>{isReplacement ? "02" : "01"}</span><div><h2>매뉴얼 파일</h2><p>전체 파일을 올리면 문서 구조와 페이지 정보를 자동 분석합니다.</p></div></div><input ref={inputRef} type="file" hidden accept={allowed.join(",")} onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])} />{file ? <div className="selected-file"><div className="file-tile"><FileText size={22} /></div><div><strong>{file.name}</strong><span>{sizeLabel(file.size)} · {extensionOf(file.name).slice(1).toUpperCase()}</span></div><button type="button" className="icon-button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} aria-label="파일 제거"><X size={18} /></button></div> : <div className={`upload-dropzone ${dragging ? "dragging" : ""}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event: DragEvent) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}><span><UploadCloud size={27} /></span><strong>매뉴얼 파일을 놓거나 클릭해 선택하세요</strong><p>HWP · HWPX · HWPML · PDF · XLS · XLSX · DOCX</p><small>파일당 최대 {maxFileLabel}</small></div>}</section>
      <details className="panel metadata-details"><summary><span><strong>관리용 정보 보완</strong><small>선택 사항 · 직원에게는 원문이 공개되지 않습니다.</small></span><ChevronDown size={17} /></summary><div className="form-grid"><label className="field-label span-2">매뉴얼 제목<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="파일명에서 자동으로 제안됩니다" /></label><label className="field-label">카테고리<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">자동 분류 전/미지정</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">담당 부서<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="예: People팀" /></label><label className="field-label">시행일<input type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} /></label><label className="field-label">표시 버전<input value={form.displayVersion} onChange={(event) => setForm({ ...form, displayVersion: event.target.value })} pattern="[0-9]+\.[0-9]+" placeholder="1.0" /></label><label className="field-label span-2">변경·설명 메모<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="개정 이유나 문서의 용도를 기록할 수 있습니다." /></label>{!isReplacement && <label className="active-field span-2"><div><strong>분석 완료 후 답변에 사용</strong><span>활성 매뉴얼만 직원 질문의 근거로 사용됩니다.</span></div><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><i /></label>}</div></details>{error && <p className="form-alert error" role="alert">{error}</p>}</div>
      <aside className="upload-summary panel"><p className="eyebrow">FILE-FIRST CHECK</p><h2>{isReplacement ? "최신본 교체 확인" : "새 매뉴얼 등록 확인"}</h2><ul><li className={isReplacement && replacementId ? "ready" : !isReplacement ? "ready" : ""}><span>{isReplacement && replacementId ? <Check size={14} /> : !isReplacement ? <Check size={14} /> : "1"}</span>{isReplacement ? selectedDocument?.title ?? "교체할 매뉴얼 선택" : "새 매뉴얼로 등록"}</li><li className={file ? "ready" : ""}><span>{file ? <Check size={14} /> : "2"}</span>지원되는 원본 파일</li><li className={form.title ? "ready" : ""}><span>{form.title ? <Check size={14} /> : "3"}</span>파일명 기반 제목</li></ul><div className="summary-note"><strong>자동 처리</strong><p>파일 업로드 → 텍스트·표 추출 → 섹션 분석 → 검색 데이터 생성 → 답변 반영</p></div><button className="button primary wide" disabled={!file || (isReplacement && !replacementId)}>{isReplacement ? "최신본 업로드 및 분석" : "매뉴얼 업로드 및 분석"}</button><button type="button" className="button ghost wide" onClick={reset}>취소</button></aside></form>
  </div>;
}
