# Onboarding RAG Chatbot

사내 온보딩 문서를 private Supabase Storage에 보관하고, 구조 보존 청킹·하이브리드 검색·근거 인용 답변을 제공하는 Next.js 15 풀스택 서비스입니다. 바탕화면의 관리자 대시보드·문서 업로드·채팅 프로토타입을 하나의 반응형 UI로 통합했습니다.

## 현재 구현

- Supabase Auth JWT/쿠키 인증과 workspace 멤버 권한 검사
- private signed upload URL, 크기·SHA-256·매직 바이트 검증
- `kordoc` 파싱, 제목/페이지/표 보존 청킹, OpenAI 임베딩
- pgvector HNSW + PostgreSQL FTS, RRF + MMR 검색
- OpenAI Responses API 답변 SSE와 문서/페이지 인용
- ingestion 재시도·멱등 처리와 검색 감사 로그
- 로그인, 워크스페이스 전환, 실시간 채팅·출처 패널·답변 평가 UI
- 관리자 대시보드, 문서 등록/상태 관리, 대화 이력·메모, 질문 분석 UI
- 새 버전 준비 완료 후 이전 버전을 자동 제외하는 무중단 문서 버전 교체·재분석·청크 검수
- Supabase migration, Vercel 함수 설정, GitHub Actions CI

## 로컬 시작

요구사항은 Node.js 20 이상, Supabase 프로젝트, OpenAI API 키입니다.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

`.env.local`에 실제 값을 넣고 `supabase/migrations`를 순서대로 적용해야 API가 동작합니다. 비밀값은 커밋하지 않습니다.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

상세 설정은 [배포 가이드](docs/deployment-guide.md), 요청·응답은 [API 계약](docs/api-contract.md), 프론트 ZIP 병합 방식은 [프론트 통합 가이드](docs/frontend-integration.md)를 참고합니다.

## 워커 실행

로컬 또는 별도 장기 실행 환경에서는 아래 프로세스를 계속 실행합니다.

```powershell
npm.cmd run worker
```

Vercel에서는 `Authorization: Bearer $CRON_SECRET`를 포함해 `GET /api/internal/ingestion/run`을 주기 호출합니다. Vercel Cron 주기는 요금제에 따라 다르므로 배포 가이드의 선택지를 먼저 확정해야 합니다.
