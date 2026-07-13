-- Canonical product-plan alignment: administrator-only document changes,
-- zero-downtime version replacement, retryable ingestion, and current-version search.

alter table public.document_versions
  add column if not exists display_version text not null default '1.0',
  add column if not exists replaces_version_id uuid references public.document_versions(id) on delete set null,
  add column if not exists is_current boolean not null default true;

alter table public.document_versions
  add constraint document_versions_display_version_format
  check (display_version ~ '^[0-9]+\.[0-9]+$') not valid;

alter table public.document_versions
  validate constraint document_versions_display_version_format;

update public.document_versions v
set display_version = d.display_version
from public.documents d
where d.id = v.document_id
  and v.display_version = '1.0';

create index if not exists document_versions_current_idx
  on public.document_versions (document_id, is_current, version_number desc);

-- Document registration and all subsequent metadata changes are administrator-only.
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
      and role in ('OWNER', 'ADMIN')
  ) then
    raise exception 'Workspace administrator access denied';
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
    id, document_id, version_number, display_version, original_file_name, content_type, byte_size,
    storage_object_path, source_sha256, parser_version, is_current
  ) values (
    p_version_id, p_document_id, 1, p_display_version, p_original_file_name, p_content_type, p_byte_size,
    p_storage_object_path, p_source_sha256, p_parser_version, true
  );

  return query select p_document_id, p_version_id;
end;
$$;

create or replace function public.register_document_replacement_upload(
  p_version_id uuid,
  p_document_id uuid,
  p_workspace_id uuid,
  p_owner_id uuid,
  p_title text,
  p_tags text[],
  p_category text,
  p_department text,
  p_effective_date date,
  p_display_version text,
  p_description text,
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
declare
  next_version integer;
  replaced_version uuid;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_owner_id
      and role in ('OWNER', 'ADMIN')
  ) then
    raise exception 'Workspace administrator access denied';
  end if;
  if not exists (select 1 from public.documents where id = p_document_id and workspace_id = p_workspace_id and archived_at is null) then
    raise exception 'Document not found in workspace';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.document_versions where document_id = p_document_id;
  select id into replaced_version
  from public.document_versions
  where document_id = p_document_id and is_current
  order by version_number desc limit 1;

  update public.documents
  set title = trim(p_title), tags = coalesce(p_tags, '{}'), category = nullif(trim(p_category), ''),
      department = nullif(trim(p_department), ''), effective_date = p_effective_date,
      description = coalesce(p_description, '')
  where id = p_document_id;

  insert into public.document_versions (
    id, document_id, version_number, display_version, replaces_version_id, is_current,
    original_file_name, content_type, byte_size, storage_object_path, source_sha256, parser_version
  ) values (
    p_version_id, p_document_id, next_version, p_display_version, replaced_version, false,
    p_original_file_name, p_content_type, p_byte_size, p_storage_object_path, p_source_sha256, p_parser_version
  );

  return query select p_document_id, p_version_id;
end;
$$;

create or replace function public.requeue_document_ingestion(p_version_id uuid)
returns public.document_versions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated public.document_versions;
begin
  select * into updated from public.document_versions where id = p_version_id for update;
  if updated.id is null then raise exception 'Unknown document version'; end if;
  if updated.parse_status not in ('READY', 'FAILED', 'NEEDS_OCR') then
    raise exception 'Version cannot be reprocessed from status %', updated.parse_status;
  end if;

  update public.document_versions
  set parse_status = 'QUEUED', processing_error = null, parsing_warnings = '[]'::jsonb,
      total_pages = null, total_chunks = 0, indexed_at = null
  where id = p_version_id
  returning * into updated;

  insert into public.ingestion_jobs (document_version_id, status, attempts, available_at, locked_at, locked_by, last_error)
  values (p_version_id, 'PENDING', 0, now(), null, null, null)
  on conflict (document_version_id) do update
    set status = 'PENDING', attempts = 0, available_at = now(), locked_at = null, locked_by = null, last_error = null;

  return updated;
end;
$$;

create or replace function public.complete_document_ingestion(
  p_job_id uuid,
  p_chunks jsonb,
  p_parse_metadata jsonb,
  p_parsing_warnings jsonb,
  p_total_pages integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  target_version_id uuid;
  target_document_id uuid;
  chunk jsonb;
  inserted_count integer := 0;
begin
  select v.id, v.document_id into target_version_id, target_document_id
  from public.ingestion_jobs j
  join public.document_versions v on v.id = j.document_version_id
  where j.id = p_job_id and j.status = 'RUNNING'
  for update of j, v;
  if target_version_id is null then raise exception 'Active ingestion job not found'; end if;
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'At least one chunk is required';
  end if;

  delete from public.document_chunks where document_version_id = target_version_id;
  for chunk in select value from jsonb_array_elements(p_chunks)
  loop
    insert into public.document_chunks (
      workspace_id, document_version_id, ordinal, content, embedding_text,
      content_sha256, token_count, section_path, page_start, page_end,
      block_start, block_end, metadata, embedding, embedding_model
    ) values (
      (chunk->>'workspaceId')::uuid, target_version_id, (chunk->>'ordinal')::integer,
      chunk->>'content', chunk->>'embeddingText', chunk->>'contentSha256',
      (chunk->>'tokenCount')::integer,
      coalesce(array(select jsonb_array_elements_text(chunk->'sectionPath')), '{}'),
      (chunk->>'pageStart')::integer, (chunk->>'pageEnd')::integer,
      (chunk->>'blockStart')::integer, (chunk->>'blockEnd')::integer,
      coalesce(chunk->'metadata', '{}'::jsonb),
      (chunk->'embedding')::text::extensions.vector(1536), 'text-embedding-3-small'
    );
    inserted_count := inserted_count + 1;
  end loop;

  update public.document_versions
  set parse_status = 'READY', parse_metadata = coalesce(p_parse_metadata, '{}'::jsonb),
      parsing_warnings = coalesce(p_parsing_warnings, '[]'::jsonb), total_pages = p_total_pages,
      total_chunks = inserted_count, indexed_at = now(), processing_error = null, is_current = true
  where id = target_version_id;

  -- Keep the prior indexed version available until this point, then atomically retire it from search.
  update public.document_versions set is_current = false
  where document_id = target_document_id and id <> target_version_id and is_current;
  update public.documents d
  set display_version = v.display_version
  from public.document_versions v
  where d.id = target_document_id and v.id = target_version_id;
  update public.ingestion_jobs set status = 'SUCCEEDED', locked_at = null, locked_by = null, last_error = null
  where id = p_job_id;
end;
$$;

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
language plpgsql volatile set search_path = public, extensions
as $$
begin
  if p_match_count not between 1 and 100 then raise exception 'p_match_count must be between 1 and 100'; end if;
  perform set_config('hnsw.ef_search', '120', true);
  return query
  select c.id, d.id, d.title, c.document_version_id, c.ordinal, c.content, c.section_path,
         c.page_start, c.page_end, c.metadata, (1 - (c.embedding <=> p_query_embedding))::real
  from public.document_chunks c
  join public.document_versions v on v.id = c.document_version_id
  join public.documents d on d.id = v.document_id
  where c.workspace_id = p_workspace_id and v.parse_status = 'READY' and v.is_current
    and d.archived_at is null and d.is_active and (p_document_ids is null or d.id = any (p_document_ids))
    and 1 - (c.embedding <=> p_query_embedding) >= 0.30
  order by c.embedding <=> p_query_embedding limit p_match_count;
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
language plpgsql stable set search_path = public, extensions
as $$
begin
  if p_match_count not between 1 and 100 then raise exception 'p_match_count must be between 1 and 100'; end if;
  return query
  with query as (select websearch_to_tsquery('simple', p_query) as tsq)
  select c.id, d.id, d.title, c.document_version_id, c.ordinal, c.content, c.section_path,
         c.page_start, c.page_end, c.metadata, ts_rank_cd(c.search_tsv, query.tsq)::real
  from public.document_chunks c
  join public.document_versions v on v.id = c.document_version_id
  join public.documents d on d.id = v.document_id cross join query
  where c.workspace_id = p_workspace_id and v.parse_status = 'READY' and v.is_current
    and d.archived_at is null and d.is_active and (p_document_ids is null or d.id = any (p_document_ids))
    and (c.search_tsv @@ query.tsq or similarity(c.content, p_query) >= 0.20)
  order by ts_rank_cd(c.search_tsv, query.tsq) desc, similarity(c.content, p_query) desc, c.created_at desc limit p_match_count;
end;
$$;

revoke all on function public.register_document_upload_v2(uuid, uuid, uuid, uuid, text, text[], text, text, date, text, text, boolean, text, text, bigint, text, text, text) from public;
revoke all on function public.register_document_replacement_upload(uuid, uuid, uuid, uuid, text, text[], text, text, date, text, text, text, text, bigint, text, text, text) from public;
revoke all on function public.requeue_document_ingestion(uuid) from public;
revoke all on function public.complete_document_ingestion(uuid, jsonb, jsonb, jsonb, integer) from public;
revoke all on function public.match_document_chunks(uuid, extensions.vector, integer, uuid[]) from public;
revoke all on function public.match_document_chunks_lexical(uuid, text, integer, uuid[]) from public;

grant execute on function public.register_document_upload_v2(uuid, uuid, uuid, uuid, text, text[], text, text, date, text, text, boolean, text, text, bigint, text, text, text) to service_role;
grant execute on function public.register_document_replacement_upload(uuid, uuid, uuid, uuid, text, text[], text, text, date, text, text, text, text, bigint, text, text, text) to service_role;
grant execute on function public.requeue_document_ingestion(uuid) to service_role;
grant execute on function public.complete_document_ingestion(uuid, jsonb, jsonb, jsonb, integer) to service_role;
grant execute on function public.match_document_chunks(uuid, extensions.vector, integer, uuid[]) to service_role;
grant execute on function public.match_document_chunks_lexical(uuid, text, integer, uuid[]) to service_role;
