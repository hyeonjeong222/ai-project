-- Product-facing document metadata, answer feedback, and private admin notes.

alter table public.documents
  add column category text,
  add column department text,
  add column effective_date date,
  add column display_version text not null default '1.0',
  add column description text not null default '',
  add column is_active boolean not null default true;

alter table public.documents
  add constraint documents_display_version_format
  check (display_version ~ '^[0-9]+\.[0-9]+$');

create index documents_active_workspace_idx
  on public.documents (workspace_id, is_active, updated_at desc)
  where archived_at is null;

alter table public.chat_messages
  add column feedback smallint check (feedback in (-1, 1)),
  add column feedback_at timestamptz;

create table public.admin_chat_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_chat_notes_thread_idx
  on public.admin_chat_notes (thread_id, created_at desc);

create trigger admin_chat_notes_set_updated_at
before update on public.admin_chat_notes
for each row execute function private.set_updated_at();

alter table public.admin_chat_notes enable row level security;
-- Notes are intentionally API-only; no direct browser policy is granted.

create or replace function public.register_document_upload_v2(
  p_document_id uuid,
  p_version_id uuid,
  p_workspace_id uuid,
  p_owner_id uuid,
  p_title text,
  p_tags text[],
  p_category text,
  p_department text,
  p_effective_date date,
  p_display_version text,
  p_description text,
  p_is_active boolean,
  p_original_file_name text,
  p_content_type text,
  p_byte_size bigint,
  p_storage_object_path text,
  p_source_sha256 text,
  p_parser_version text
)
returns table (document_id uuid, version_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_owner_id
      and role in ('OWNER', 'ADMIN', 'MEMBER')
  ) then
    raise exception 'Workspace write access denied';
  end if;

  insert into public.documents (
    id, workspace_id, owner_id, title, tags, category, department,
    effective_date, display_version, description, is_active
  ) values (
    p_document_id, p_workspace_id, p_owner_id, trim(p_title), coalesce(p_tags, '{}'),
    nullif(trim(p_category), ''), nullif(trim(p_department), ''), p_effective_date,
    p_display_version, coalesce(p_description, ''), p_is_active
  );

  insert into public.document_versions (
    id, document_id, version_number, original_file_name, content_type, byte_size,
    storage_object_path, source_sha256, parser_version
  ) values (
    p_version_id, p_document_id, 1, p_original_file_name, p_content_type, p_byte_size,
    p_storage_object_path, p_source_sha256, p_parser_version
  );

  return query select p_document_id, p_version_id;
end;
$$;

revoke all on function public.register_document_upload_v2(uuid, uuid, uuid, uuid, text, text[], text, text, date, text, text, boolean, text, text, bigint, text, text, text) from public;
grant execute on function public.register_document_upload_v2(uuid, uuid, uuid, uuid, text, text[], text, text, date, text, text, boolean, text, text, bigint, text, text, text) to service_role;

create or replace function public.match_document_chunks(
  p_workspace_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 60,
  p_document_ids uuid[] default null
)
returns table (
  chunk_id uuid, document_id uuid, document_title text, document_version_id uuid,
  ordinal integer, content text, section_path text[], page_start integer,
  page_end integer, metadata jsonb, similarity real
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
  select c.id, d.id, d.title, c.document_version_id, c.ordinal, c.content,
         c.section_path, c.page_start, c.page_end, c.metadata,
         (1 - (c.embedding <=> p_query_embedding))::real
  from public.document_chunks c
  join public.document_versions v on v.id = c.document_version_id
  join public.documents d on d.id = v.document_id
  where c.workspace_id = p_workspace_id
    and v.parse_status = 'READY'
    and d.archived_at is null
    and d.is_active
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
  chunk_id uuid, document_id uuid, document_title text, document_version_id uuid,
  ordinal integer, content text, section_path text[], page_start integer,
  page_end integer, metadata jsonb, lexical_score real
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
  with query as (select websearch_to_tsquery('simple', p_query) as tsq)
  select c.id, d.id, d.title, c.document_version_id, c.ordinal, c.content,
         c.section_path, c.page_start, c.page_end, c.metadata,
         ts_rank_cd(c.search_tsv, query.tsq)::real
  from public.document_chunks c
  join public.document_versions v on v.id = c.document_version_id
  join public.documents d on d.id = v.document_id
  cross join query
  where c.workspace_id = p_workspace_id
    and v.parse_status = 'READY'
    and d.archived_at is null
    and d.is_active
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
