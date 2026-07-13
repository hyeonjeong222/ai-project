# 프론트엔드 ZIP 통합 가이드

## 현재 통합 기준

백엔드/RAG 코드는 `lib/server`, `lib/rag`, `lib/supabase`, `app/v1`, `app/api/internal`, `supabase`에 분리되어 있습니다. 팀 프론트 코드가 주로 교체할 영역은 아래입니다.

- `app/(product)/chat`, `components/chat`
- `app/(product)/admin`, `components/admin`
- `components/app`의 공통 shell과 workspace provider
- 공통 UI와 스타일

`app/v1`, `lib/server`, `lib/rag`, `lib/supabase`, `scripts`, `supabase`는 UI ZIP을 병합할 때 덮어쓰지 않습니다. 공통 색상·레이아웃은 `app/globals.css`, 루트 metadata는 `app/layout.tsx`에 있습니다.

## ZIP을 받을 때

1. ZIP마다 원본 폴더명과 담당자를 유지해 별도 임시 폴더에 풉니다.
2. 각 프로젝트의 `package.json`, lockfile, tsconfig, alias, CSS/Tailwind 버전을 비교합니다.
3. 화면을 먼저 복사하지 않고 API mock과 타입을 [API 계약](api-contract.md)에 매핑합니다.
4. 공통 파일은 한 명의 기준안을 정한 뒤 기능 화면을 작은 단위로 옮깁니다.
5. mock 제거와 시각 변경을 같은 diff에 섞지 않습니다.

## 프론트가 지켜야 할 계약

- 브라우저에는 publishable key만 사용하고 service role/OpenAI key를 넣지 않습니다.
- 업로드 전에 SHA-256을 계산하고 signed upload URL을 사용합니다.
- complete 성공 뒤 상태 SSE를 구독하며 `READY` 전 질문 버튼을 비활성화합니다.
- chat 응답은 일반 JSON이 아니라 SSE이므로 이벤트별 reducer를 둡니다.
- 대화 목록과 메시지는 각각 `GET /v1/chat/threads`, `GET /v1/chat/threads/{id}/messages`에서 복원합니다.
- citation 원문은 raw Storage 경로를 만들지 않고 `sourceUrl`을 호출합니다.
- 관리자 화면은 `OWNER` 또는 `ADMIN`만 사용하며, 메뉴 숨김과 별개로 서버 API가 권한을 다시 검사합니다.
- `401`은 세션 갱신/로그인, `403`은 권한 안내, `409`는 업로드 불일치 재업로드, `NEEDS_OCR`은 별도 상태로 표시합니다.

## 통합 완료 기준

- 모든 화면이 동일한 Supabase 세션과 `WorkspaceProvider` 사용
- workspace 전환 시 문서·대화 cache key 분리
- SSE 재연결/취소와 중복 token 방지
- 업로드 실패·파싱 실패·OCR 필요·빈 검색 결과 UI
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` 통과
