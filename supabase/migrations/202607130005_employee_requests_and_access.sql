-- Employee-facing requests and a strict separation between chatbot users and
-- manual administrators. RAG remains service-role only; employees never read
-- the source documents directly.

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete restrict,
  thread_id uuid references public.chat_threads(id) on delete set null,
  kind text not null check (kind in ('HUMAN_ANSWER', 'DOCUMENT_REQUEST')),
  subject text not null check (char_length(subject) between 1 and 160),
  content text not null check (char_length(content) between 1 and 4000),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED')),
  response text check (response is null or char_length(response) between 1 and 4000),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((response is null and responded_by is null and responded_at is null) or response is not null)
);

create index support_requests_workspace_status_idx
  on public.support_requests (workspace_id, status, updated_at desc);
create index support_requests_requester_idx
  on public.support_requests (requester_id, updated_at desc);

create trigger support_requests_set_updated_at
before update on public.support_requests
for each row execute function private.set_updated_at();

alter table public.support_requests enable row level security;

create policy "requesters can read their own support requests"
on public.support_requests for select to authenticated
using (
  requester_id = auth.uid()
  or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = support_requests.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('OWNER', 'ADMIN')
  )
);

create policy "members can create their own support requests"
on public.support_requests for insert to authenticated
with check (
  requester_id = auth.uid()
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = support_requests.workspace_id
      and wm.user_id = auth.uid()
  )
);

create policy "administrators can update support requests"
on public.support_requests for update to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = support_requests.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('OWNER', 'ADMIN')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = support_requests.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('OWNER', 'ADMIN')
  )
);

-- Source manuals are restricted to manual administrators. Employees may use
-- the chatbot, but the retrieval service never exposes stored source files.
drop policy if exists "workspace members can read documents" on public.documents;
drop policy if exists "workspace members can read document versions" on public.document_versions;
drop policy if exists "workspace members can read chunks" on public.document_chunks;

create policy "administrators can read documents"
on public.documents for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = documents.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('OWNER', 'ADMIN')
  )
);

create policy "administrators can read document versions"
on public.document_versions for select to authenticated
using (
  exists (
    select 1
    from public.documents d
    join public.workspace_members wm on wm.workspace_id = d.workspace_id
    where d.id = document_versions.document_id
      and wm.user_id = auth.uid()
      and wm.role in ('OWNER', 'ADMIN')
  )
);

create policy "administrators can read chunks"
on public.document_chunks for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = document_chunks.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('OWNER', 'ADMIN')
  )
);
