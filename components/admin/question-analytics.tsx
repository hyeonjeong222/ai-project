"use client";

import { CircleAlert, Gauge, MessageSquareText, Target, ThumbsUp, Users } from "lucide-react";
import { useState } from "react";

import { PageError, PageLoading } from "@/components/admin/admin-dashboard";
import { useDashboardData } from "@/lib/client/use-dashboard";

export function QuestionAnalytics() {
  const [range, setRange] = useState<"7" | "30" | "all">("30");
  const { data, loading, error, refresh } = useDashboardData(range);
  if (loading) return <PageLoading label="질문 품질 지표를 계산하고 있습니다." />;
  if (error || !data) return <PageError message={error} onRetry={refresh} />;
  const max = Math.max(...data.daily.map((item) => item.questions), 1);
  const answered = data.summary.questions - data.summary.unanswered;
  const coverage = data.summary.questions ? Math.round(answered / data.summary.questions * 100) : 0;
  return <div className="admin-page"><header className="page-header"><div><p className="eyebrow">RAG QUALITY</p><h1>질문 통계</h1><p>직원 질문의 문서 커버리지와 검색 성능을 기준으로 지식 공백을 찾습니다.</p></div><div className="range-switch">{(["7", "30", "all"] as const).map((value) => <button className={range === value ? "active" : ""} key={value} onClick={() => setRange(value)}>{value === "all" ? "전체" : `${value}일`}</button>)}</div></header>
    <section className="metric-grid analytics-metrics"><AnalyticMetric icon={MessageSquareText} label="전체 질문" value={`${data.summary.questions}`} note="retrieval 실행 기준" /><AnalyticMetric icon={Target} label="문서 커버리지" value={`${coverage}%`} note={`${answered}건 근거 답변`} /><AnalyticMetric icon={ThumbsUp} label="만족도" value={data.summary.satisfaction === null ? "—" : `${data.summary.satisfaction}%`} note="응답 평가 기준" /><AnalyticMetric icon={Users} label="활성 사용자" value={`${data.summary.activeUsers}`} note="기간 내 대화 사용자" /></section>
    <section className="analytics-grid"><article className="panel analytics-chart"><div className="panel-header"><div><p className="eyebrow">DAILY COVERAGE</p><h2>질문과 답변 실패 추이</h2></div><div className="chart-legend"><span><i className="blue" />전체 질문</span><span><i className="red" />근거 없음</span></div></div><div className="line-bars">{data.daily.map((item) => <div key={item.date}><span className="bar-total" style={{ height: `${Math.max(item.questions ? 10 : 0, item.questions / max * 100)}%` }}><i style={{ height: `${item.questions ? item.unanswered / item.questions * 100 : 0}%` }} /></span><small>{new Date(`${item.date}T00:00:00`).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</small></div>)}</div></article><article className="panel quality-card"><p className="eyebrow">KNOWLEDGE HEALTH</p><h2>현재 지식 상태</h2><div className="coverage-ring" style={{ "--coverage": `${coverage * 3.6}deg` } as React.CSSProperties}><div><strong>{coverage}%</strong><span>coverage</span></div></div><ul><li><Gauge size={16} /><span>답변 준비 문서</span><strong>{data.summary.readyDocuments}/{data.summary.documents}</strong></li><li><CircleAlert size={16} /><span>보완 필요 질문</span><strong>{data.summary.unanswered}</strong></li><li><ThumbsUp size={16} /><span>사용자 만족도</span><strong>{data.summary.satisfaction === null ? "—" : `${data.summary.satisfaction}%`}</strong></li></ul></article></section>
    <section className="panel analytics-gaps"><div className="panel-header"><div><p className="eyebrow">RECOMMENDED REVIEW</p><h2>우선 검토할 질문</h2></div></div>{data.recentUnanswered.length ? <div>{data.recentUnanswered.map((item, index) => <article key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.question}</strong><small>{new Date(item.createdAt).toLocaleString("ko-KR")}</small></div><em>문서 보완 필요</em></article>)}</div> : <div className="success-empty"><Target size={28} /><strong>검토 대기 질문이 없습니다.</strong></div>}</section>
    <section className="usage-grid"><article className="panel usage-panel"><div className="panel-header"><div><p className="eyebrow">FAQ TOP 10</p><h2>자주 묻는 질문</h2></div></div>{data.topQuestions.length ? <ol>{data.topQuestions.map((item) => <li key={item.question}><span>{item.question}</span><strong>{item.count}회</strong></li>)}</ol> : <p className="muted">아직 집계할 질문이 없습니다.</p>}</article><article className="panel usage-panel"><div className="panel-header"><div><p className="eyebrow">DOCUMENT USAGE</p><h2>문서별 인용 횟수</h2></div></div>{data.documentUsage.length ? <ol>{data.documentUsage.map((item) => <li key={item.documentId}><span>{item.title}<small>{item.category ?? "미분류"}</small></span><strong>{item.count}회</strong></li>)}</ol> : <p className="muted">아직 인용된 문서가 없습니다.</p>}</article></section>
  </div>;
}

function AnalyticMetric({ icon: Icon, label, value, note }: { icon: typeof Gauge; label: string; value: string; note: string }) { return <article className="metric-card analytic"><div className="metric-icon navy"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>; }
