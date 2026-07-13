-- Browser writes only through a backend-issued signed upload URL. The API/worker
-- uses the service_role key; never expose that key to a client.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Internal security-definer and trigger helpers never live in an exposed schema.
create schema if not exists private;
revoke all on schema private from public;

insert into storage.buckets (id, name, public)
values ('knowledge-files', 'knowledge-files', false)
on conflict (id) do update set public = false;

create type public.document_parse_status as enum (
  'UPLOADING', 'QUEUED', 'PARSING', 'NEEDS_OCR', 'CHUNKING',
  'EMBEDDING', 'READY', 'FAILED', 'DELETED'
);

create type public.ingestion_job_status as enum (
  'PENDING', 'RUNNING', 'RETRY', 'SUCCEEDED', 'FAILED', 'CANCELLED'
);

create type public.chat_message_role as enum ('USER', 'ASSISTANT', 'SYSTEM');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 500),
  tags text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_workspace_idx on public.documents (workspace_id, created_at desc)
  where archived_at is null;

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  original_file_name text not null check (char_length(original_file_name) between 1 and 1024),
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  storage_object_path text not null unique,
  parsed_storage_path text,
  source_sha256 char(64) not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  parser_name text not null default 'kordoc',
  parser_version text not null,
  chunker_version text not null default 'structural-v1',
  embedding_model text not null default 'text-embedding-3-small',
  embedding_dimensions smallint not null default 1536 check (embedding_dimensions = 1536),
  parse_status public.document_parse_status not null default 'UPLOADING',
  parse_metadata jsonb not null default '{}'::jsonb,
  parsing_warnings jsonb not null default '[]'::jsonb,
  processing_error jsonb,
  total_pages integer check (total_pages is null or total_pages >= 0),
  total_chunks integer not null default 0 check (total_chunks >= 0),
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create index document_versions_document_idx on public.document_versions (document_id, version_number desc);
create index document_versions_status_idx on public.document_versions (parse_status, created_at)
  where parse_status in ('QUEUED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'READY');

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null unique references public.document_versions(id) on delete cascade,
  status public.ingestion_job_status not null default 'PENDING',
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ingestion_jobs_claim_idx on public.ingestion_jobs (available_at, created_at)
  where status in ('PENDING', 'RETRY');

-- `workspace_id` is deliberately denormalized for a selective tenant filter before
-- vector ranking. The trigger below derives it from document_version_id.
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  content text not null check (char_length(content) > 0),
  embedding_text text not null check (char_length(embedding_text) > 0),
  content_sha256 char(64) not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  token_count integer not null check (token_count > 0),
  section_path text[] not null default '{}',
  page_start integer check (page_start is null or page_start > 0),
  page_end integer check (page_end is null or page_end >= page_start),
  block_start integer check (block_start is null or block_start >= 0),
  block_end integer check (block_end is null or block_end >= block_start),
  metadata jsonb not null default '{}'::jsonb,
  search_tsv tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding extensions.vector(1536) not null,
  embedding_model text not null default 'text-embedding-3-small',
  created_at timestamptz not null default now(),
  unique (document_version_id, ordinal)
);

create index document_chunks_workspace_idx on public.document_chunks (workspace_id, document_version_id, ordinal);
create index document_chunks_fts_idx on public.document_chunks using gin (search_tsv);
create index document_chunks_embedding_hnsw_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_workspace_user_idx on public.chat_threads (workspace_id, user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role public.chat_message_role not null,
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

create table public.retrieval_runs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.chat_threads(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  original_query text not null,
  search_query text not null,
  embedding_model text not null,
  vector_candidate_count integer not null check (vector_candidate_count >= 0),
  lexical_candidate_count integer not null check (lexical_candidate_count >= 0),
  selected_count integer not null check (selected_count >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

create table public.retrieval_run_hits (
  retrieval_run_id uuid not null references public.retrieval_runs(id) on delete cascade,
  chunk_id uuid not null references public.document_chunks(id) on delete restrict,
  vector_rank integer check (vector_rank is null or vector_rank > 0),
  lexical_rank integer check (lexical_rank is null or lexical_rank > 0),
  fused_rank integer not null check (fused_rank > 0),
  fused_score real not null,
  selected boolean not null default false,
  primary key (retrieval_run_id, chunk_id)
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.assign_chunk_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_workspace_id uuid;
begin
  select d.workspace_id
    into expected_workspace_id
  from public.document_versions v
  join public.documents d on d.id = v.document_id
  where v.id = new.document_version_id;

  if expected_workspace_id is null then
    raise exception 'Unknown document_version_id: %', new.document_version_id;
  end if;

  new.workspace_id = expected_workspace_id;
  return new;
end;
$$;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function private.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function private.set_updated_at();

create trigger document_versions_set_updated_at
before update on public.document_versions
for each row execute function private.set_updated_at();

create trigger ingestion_jobs_set_updated_at
before update on public.ingestion_jobs
for each row execute function private.set_updated_at();

create trigger chat_threads_set_updated_at
before update on public.chat_threads
for each row execute function private.set_updated_at();

create trigger document_chunks_assign_workspace
before insert or update of document_version_id on public.document_chunks
for each row execute function private.assign_chunk_workspace();

revoke all on function private.set_updated_at() from public;
revoke all on function private.assign_chunk_workspace() from public;
grant execute on function private.set_updated_at() to service_role;
grant execute on function private.assign_chunk_workspace() to service_role;

-- RLS: user-facing reads are workspace scoped. Mutations and all raw chunk access
-- stay in the backend API/worker, which uses the service_role key server-side.
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

grant usage on schema private to authenticated;
revoke all on function private.is_workspace_member(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.retrieval_runs enable row level security;
alter table public.retrieval_run_hits enable row level security;

create policy "workspace members can read workspaces"
on public.workspaces for select to authenticated
using (private.is_workspace_member(id));

create policy "workspace members can read member list"
on public.workspace_members for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy "workspace members can read documents"
on public.documents for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy "workspace members can read document versions"
on public.document_versions for select to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = document_versions.document_id
      and private.is_workspace_member(d.workspace_id)
  )
);

create policy "users can read their chat threads"
on public.chat_threads for select to authenticated
using (user_id = auth.uid() and private.is_workspace_member(workspace_id));

create policy "users can read messages in their chat threads"
on public.chat_messages for select to authenticated
using (
  exists (
    select 1 from public.chat_threads t
    where t.id = chat_messages.thread_id
      and t.user_id = auth.uid()
      and private.is_workspace_member(t.workspace_id)
  )
);

-- No direct client policy is created for jobs, chunks, retrieval audit rows, or
-- writes. service_role bypasses RLS only inside the trusted backend/worker.

-- Vector and lexical RPCs are intentionally service_role-only. The backend has
-- already authorized the user and may apply document/tag filters before calling.
create or replace function public.match_document_chunks(
  p_workspace_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 60,
  p_document_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_version_id uuid,
  ordinal integer,
  content text,
  section_path text[],
  page_start integer,
  page_end integer,
  metadata jsonb,
  similarity real
)
language plpgsql
volatile
set search_path = public, extensions
as $$
begin
  if p_match_count not between 1 and 100 then
    raise exception 'p_match_count must be between 1 and 100';
  end if;

  perform set_config('hnsw.ef_search', '120', true);

  return query
  select
    c.id,
    d.id,
    d.title,
    c.document_version_id,
    c.ordinal,
    c.content,
    c.section_path,
    c.page_start,
    c.page_end,
    c.metadata,
    (1 - (c.embedding <=> p_query_embedding))::real
  from public.document_chunks c
  join public.document_versions v on v.id = c.document_version_id
  join public.documents d on d.id = v.document_id
  where c.workspace_id = p_workspace_id
    and v.parse_status = 'READY'
    and d.archived_at is null
    and (p_document_ids is null or d.id = any (p_document_ids))
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
end;
$$;

create or replace function public.match_document_chunks_lexical(
  p_workspace_id uuid,
  p_query text,
  p_match_count integer default 40,
  p_document_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_version_id uuid,
  ordinal integer,
  content text,
  section_path text[],
  page_start integer,
  page_end integer,
  metadata jsonb,
  lexical_score real
)
language plpgsql
stable
set search_path = public, extensions
as $$
begin
  if p_match_count not between 1 and 100 then
    raise exception 'p_match_count must be between 1 and 100';
  end if;

  return query
  with query as (
    select websearch_to_tsquery('simple', p_query) as tsq
  )
  select
    c.id,
    d.id,
    d.title,
    c.document_version_id,
    c.ordinal,
    c.content,
    c.section_path,
    c.page_start,
    c.page_end,
    c.metadata,
    ts_rank_cd(c.search_tsv, query.tsq)::real
  from public.document_chunks c
  join public.document_versions v on v.id = c.document_version_id
  join public.documents d on d.id = v.document_id
  cross join query
  where c.workspace_id = p_workspace_id
    and v.parse_status = 'READY'
    and d.archived_at is null
    and (p_document_ids is null or d.id = any (p_document_ids))
    and c.search_tsv @@ query.tsq
  order by ts_rank_cd(c.search_tsv, query.tsq) desc, c.created_at desc
  limit p_match_count;
end;
$$;

revoke all on function public.match_document_chunks(uuid, extensions.vector, integer, uuid[]) from public;
revoke all on function public.match_document_chunks_lexical(uuid, text, integer, uuid[]) from public;
grant execute on function public.match_document_chunks(uuid, extensions.vector, integer, uuid[]) to service_role;
grant execute on function public.match_document_chunks_lexical(uuid, text, integer, uuid[]) to service_role;
