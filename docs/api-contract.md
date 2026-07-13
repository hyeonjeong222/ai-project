# 백엔드 API 계약

기본 경로는 `/v1`이며 JSON API 오류는 아래 형태입니다.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 형식이 올바르지 않습니다.",
    "details": {}
  }
}
```

인증은 Supabase access token을 `Authorization: Bearer <JWT>`로 보내거나, 같은 도메인의 Supabase SSR 쿠키를 사용합니다. `service_role` 키는 브라우저에 절대 전달하지 않습니다.

## Workspace

### `GET /v1/workspaces`

로그인 사용자가 속한 workspace와 역할을 반환합니다.

### `POST /v1/workspaces`

```json
{ "name": "신입 온보딩" }
```

workspace와 요청자를 `OWNER`로 만드는 멤버십을 한 트랜잭션에서 생성합니다.

## 문서 업로드

### `POST /v1/workspaces/{workspaceId}/documents/uploads`

브라우저에서 업로드 전에 SHA-256을 계산합니다.

```json
{
  "title": "2026년 인사 규정",
  "fileName": "인사규정.pdf",
  "contentType": "application/pdf",
  "byteSize": 1048576,
  "sha256": "64자리 소문자 hex",
  "tags": ["인사", "필수"],
  "category": "정책 및 규정",
  "department": "인사팀",
  "effectiveDate": "2026-07-01",
  "displayVersion": "1.0",
  "description": "신입 구성원이 확인할 인사 규정",
  "isActive": true
}
```

응답의 `upload.url`과 `upload.token`을 Supabase Storage SDK의 signed upload에 사용합니다. 경로는 서버가 `workspace/document/version/file`로 생성합니다.

### `POST /v1/document-versions/{versionId}/complete`

본문은 필요 없습니다. 서버가 실제 Storage 객체의 크기, SHA-256, 매직 바이트를 검증한 뒤 ingestion을 큐에 넣습니다. 중복 완료 요청은 현재 상태와 `idempotent: true`를 반환합니다.

### `GET /v1/document-versions/{versionId}`

문서 정보와 `parse_status`, 경고, 오류, 페이지/청크 수를 반환합니다.

### `GET /v1/document-versions/{versionId}/events`

최대 약 25초 동안 상태 변화를 SSE `status` 이벤트로 보냅니다. 연결이 끝났지만 상태가 terminal이 아니면 프론트가 다시 연결합니다.

Terminal 상태는 `READY`, `FAILED`, `NEEDS_OCR`, `DELETED`입니다. 질문 UI는 `READY`에서만 활성화합니다.

### `GET /v1/workspaces/{workspaceId}/documents`

문서 메타데이터와 최신 버전 처리 상태를 반환합니다. `q`, `status`, `active` query로 필터링할 수 있습니다.

### `PATCH /v1/documents/{documentId}`

`isActive`, `archived`와 제목·카테고리·담당부서·시행일·설명을 수정합니다. `OWNER`와 `ADMIN`만 호출할 수 있습니다.

### `GET /v1/documents/{documentId}`

문서 메타데이터와 전체 버전 이력을 반환합니다. 관리자 전용입니다.

### `POST /v1/documents/{documentId}/versions/uploads`

기존 문서의 새 버전용 signed upload URL을 발급합니다. 새 버전은 `READY`가 되는 순간에만 현재 버전이 되며, 그 전까지 기존 버전은 계속 검색됩니다.

### `POST /v1/document-versions/{versionId}/reparse`

`READY`, `FAILED`, `NEEDS_OCR` 버전의 원본 파일을 다시 분석 대기열에 넣습니다. 관리자 전용입니다.

### `GET /v1/document-versions/{versionId}/chunks`

헤딩 경로·페이지·토큰 수를 포함한 색인 청크를 반환해 관리자가 파싱 결과를 검수할 수 있게 합니다.

## 대화

### `POST /v1/chat/threads`

```json
{ "workspaceId": "uuid", "title": "휴가 규정 질문" }
```

### `GET /v1/chat/threads?workspaceId={workspaceId}`

로그인 사용자의 대화 목록, 최근 미리보기, 메시지 수를 반환합니다.

### `GET /v1/chat/threads/{threadId}/messages`

자신의 대화 메시지와 인용·평가를 시간순으로 반환합니다.

### `POST /v1/chat/threads/{threadId}/messages`

```json
{
  "content": "연차 사용 절차는?",
  "documentIds": ["선택 필터 문서 uuid"]
}
```

응답 `Content-Type`은 `text/event-stream`입니다.

| 이벤트 | 데이터 |
| --- | --- |
| `retrieval` | 재작성 검색문, 후보 수, 선택 근거 수 |
| `citation` | 문서명, 페이지, 섹션, 미리보기, `sourceUrl` |
| `token` | `{ "delta": "..." }` |
| `done` | 저장된 assistant message ID와 전체 인용 |
| `error` | 스트림 중 오류 코드와 사용자 메시지 |

`sourceUrl`을 로그인 상태로 호출하면 60초짜리 private 원문 URL과 페이지 범위를 받습니다.

### `PATCH /v1/chat/messages/{messageId}/feedback`

자신이 받은 assistant 답변에 `{ "feedback": 1 }`, `{ "feedback": -1 }` 또는 `{ "feedback": null }`을 저장합니다.

## 관리자

- `GET /v1/workspaces/{workspaceId}/dashboard`: 문서·질문·답변 성공률 요약과 최근 미답변
- `GET /v1/workspaces/{workspaceId}/chat-history`: 대화/사용자/상태 필터와 상세 메시지
- `POST /v1/workspaces/{workspaceId}/chat-history/{threadId}/notes`: 관리자 내부 메모 저장

모든 관리자 API는 `OWNER` 또는 `ADMIN` 역할을 서버에서 검사합니다.

문서 업로드·수정·버전 교체·재분석도 관리자 전용입니다. 일반 구성원은 채팅 화면에서 `GET /v1/workspaces/{workspaceId}/documents?view=chat`으로 활성화된 `READY` 문서만 조회합니다.

## 내부 워커

### `GET|POST /api/internal/ingestion/run`

`Authorization: Bearer <CRON_SECRET>`가 필수입니다. 한 호출에서 `RAG_WORKER_BATCH_SIZE`개 작업을 선점해 처리하며 기본값은 1입니다. 브라우저에서 호출하지 않습니다.
