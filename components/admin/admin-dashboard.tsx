"use client";

import { ArrowRight, CircleAlert, Clock3, FileCheck2, Files, MessageSquareText, RefreshCw, ThumbsUp } from "lucide-react";
import Link from "next/link";

import { AssistantAvatar } from "@/components/app/brand-assets";
import { useWorkspace } from "@/components/app/workspace-provider";
import { useDashboardData } from "@/lib/client/use-dashboard";

export function AdminDashboard() {
  const { workspace } = useWorkspace();
  const { data, loading, error, refresh } = useDashboardData();
  if (loading) return <PageLoading label="대시보드 데이터를 모으는 중입니다." />;
  if (error || !data) return <PageError message={error} onRetry={refresh} />;
  const max = Math.max(...data.daily.map((day) => day.questions), 1);
  const answerRate = data.summary.questions ? Math.round(((data.summary.questions - data.summary.unanswered) / data.summary.questions) * 100) : 0;
  return (
    <div className="admin-page">
      <header className="page-header"><div><p className="eyebrow">ADMIN OVERVIEW</p><h1>{workspace?.name} 지식 운영</h1><p>문서 준비 상태와 직원 질문 품질을 한눈에 확인하세요.</p></div><button className="button secondary" onClick={refresh}><RefreshCw size={16} />새로고침</button></header>
      <section className="metric-grid">
        <Metric icon={Files} label="등록 문서" value={`${data.summary.documents}`} detail={`${data.summary.readyDocuments}개 답변 준비 완료`} tone="blue" />
        <Metric icon={MessageSquareText} label="최근 30일 질문" value={`${data.summary.questions}`} detail={`${data.summary.conversations}개 대화에서 수집`} tone="navy" />
        <Metric icon={FileCheck2} label="근거 답변률" value={`${answerRate}%`} detail={`${data.summary.unanswered}건 근거 확인 필요`} tone="green" />
        <Metric icon={ThumbsUp} label="답변 만족도" value={data.summary.satisfaction === null ? "—" : `${data.summary.satisfaction}%`} detail="평가가 저장된 답변 기준" tone="amber" />
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel"><div className="panel-header"><div><p className="eyebrow">QUESTION FLOW</p><h2>최근 14일 질문 추이</h2></div><span className="data-chip"><Clock3 size={14} />평균 {data.summary.averageRetrievalMs ?? "—"}ms</span></div><div className="bar-chart" aria-label="최근 14일 질문 수 막대 차트">{data.daily.map((day) => <div className="bar-column" key={day.date}><div className="bar-track"><div className="bar unanswered" style={{ height: `${Math.max(0, day.unanswered / max * 100)}%` }} /><div className="bar questions" style={{ height: `${Math.max(day.questions ? 8 : 0, (day.questions - day.unanswered) / max * 100)}%` }} /></div><span>{new Date(`${day.date}T00:00:00`).getDate()}</span></div>)}</div><div className="chart-legend"><span><i className="blue" />근거 답변</span><span><i className="red" />답변 없음</span></div></article>
        <article className="panel unanswered-panel"><div className="panel-header"><div><p className="eyebrow">CONTENT GAPS</p><h2>최근 답변하지 못한 질문</h2></div><Link href="/admin/history" className="text-link">전체 기록 <ArrowRight size={14} /></Link></div>{data.recentUnanswered.length ? <ul className="gap-list">{data.recentUnanswered.map((item) => <li key={item.id}><span className="alert-icon"><CircleAlert size={16} /></span><div><strong>{item.question}</strong><small>{new Date(item.createdAt).toLocaleString("ko-KR")}</small></div></li>)}</ul> : <div className="success-empty"><AssistantAvatar variant="full" className="dashboard-character" /><strong>최근 누락 질문이 없습니다.</strong><span>현재 문서가 질문을 잘 커버하고 있습니다.</span></div>}</article>
      </section>
      <section className="panel action-panel"><div><p className="eyebrow">NEXT ACTION</p><h2>문서를 최신 상태로 유지하세요</h2><p>READY 문서만 직원 답변에 사용되며 비활성 문서는 검색에서 자동 제외됩니다.</p></div><div><Link href="/admin/documents" className="button secondary">문서 상태 보기</Link><Link href="/admin/documents/new" className="button primary">새 문서 등록</Link></div></section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Files; label: string; value: string; detail: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

export function PageLoading({ label }: { label: string }) { return <div className="page-state"><span className="spinner" /><p>{label}</p></div>; }
export function PageError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="page-state error-state"><CircleAlert size={30} /><h2>데이터를 표시하지 못했습니다.</h2><p>{message}</p><button className="button secondary" onClick={onRetry}>다시 시도</button></div>; }
