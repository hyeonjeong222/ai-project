-- Transactional operations used by the trusted API and ingestion worker.
-- All functions are service_role-only because the API authorizes the end user first.

grant usage on schema private to service_role;

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/x-hwp',
      'application/haansofthwp',
      'application/hwp+zip',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/xml',
      'text/xml',
      'application/zip',
      'application/octet-stream'
    ]
where id = 'knowledge-files';

create or replace function public.create_workspace(
  p_user_id uuid,
  p_name text
)
returns public.workspaces
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created public.workspaces;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unknown user';
  end if;

  insert into public.workspaces (name, created_by)
  values (trim(p_name), p_user_id)
  returning * into created;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (created.id, p_user_id, 'OWNER');

  return created;
end;
$$;

create or replace function public.register_document_upload(
  p_document_id uuid,
  p_version_id uuid,
  p_workspace_id uuid,
  p_owner_id uuid,
  p_title text,
  p_tags text[],
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
  new_document_id uuid;
  new_version_id uuid;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_owner_id
      and role in ('OWNER', 'ADMIN', 'MEMBER')
  ) then
    raise exception 'Workspace write access denied';
  end if;

  insert into public.documents (id, workspace_id, owner_id, title, tags)
  values (p_document_id, p_workspace_id, p_owner_id, trim(p_title), coalesce(p_tags, '{}'))
  returning id into new_document_id;

  insert into public.document_versions (
    id, document_id, version_number, original_file_name, content_type, byte_size,
    storage_object_path, source_sha256, parser_version
  ) values (
    p_version_id, new_document_id, 1, p_original_file_name, p_content_type, p_byte_size,
    p_storage_object_path, p_source_sha256, p_parser_version
  ) returning id into new_version_id;

  return query select new_document_id, new_version_id;
end;
$$;

create or replace function public.queue_document_ingestion(p_version_id uuid)
returns public.document_versions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated public.document_versions;
begin
  select * into updated from public.document_versions
  where id = p_version_id for update;

  if updated.id is null then
    raise exception 'Unknown document version';
  end if;

  if updated.parse_status in ('QUEUED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'READY') then
    return updated;
  end if;
  if updated.parse_status <> 'UPLOADING' then
    raise exception 'Version cannot be queued from status %', updated.parse_status;
  end if;

  update public.document_versions
  set parse_status = 'QUEUED', processing_error = null
  where id = p_version_id
  returning * into updated;

  insert into public.ingestion_jobs (document_version_id, status, available_at)
  values (p_version_id, 'PENDING', now())
  on conflict (document_version_id) do update
    set status = 'PENDING', available_at = now(), locked_at = null, locked_by = null;

  return updated;
end;
$$;

create or replace function public.claim_ingestion_job(p_worker_id text)
returns table (
  job_id uuid,
  attempts integer,
  version_id uuid,
  document_id uuid,
  workspace_id uuid,
  storage_object_path text,
  original_file_name text,
  content_type text,
  byte_size bigint,
  source_sha256 text,
  document_title text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed_job public.ingestion_jobs;
begin
  select j.* into claimed_job
  from public.ingestion_jobs j
  join public.document_versions v on v.id = j.document_version_id
  where j.status in ('PENDING', 'RETRY')
    and j.available_at <= now()
    and v.parse_status = 'QUEUED'
  order by j.available_at, j.created_at
  for update of j skip locked
  limit 1;

  if claimed_job.id is null then return; end if;

  update public.ingestion_jobs
  set status = 'RUNNING', attempts = attempts + 1, locked_at = now(), locked_by = p_worker_id
  where id = claimed_job.id
  returning * into claimed_job;

  update public.document_versions
  set parse_status = 'PARSING', processing_error = null
  where id = claimed_job.document_version_id;

  return query
  select claimed_job.id, claimed_job.attempts, v.id, d.id, d.workspace_id,
         v.storage_object_path, v.original_file_name, v.content_type, v.byte_size,
         v.source_sha256::text, d.title
  from public.document_versions v
  join public.documents d on d.id = v.document_id
  where v.id = claimed_job.document_version_id;
end;
$$;

create or replace function public.set_ingestion_stage(
  p_job_id uuid,
  p_status public.document_parse_status
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('PARSING', 'CHUNKING', 'EMBEDDING') then
    raise exception 'Invalid active ingestion status';
  end if;

  update public.document_versions v set parse_status = p_status
  from public.ingestion_jobs j
  where j.id = p_job_id and j.document_version_id = v.id and j.status = 'RUNNING';
  if not found then raise exception 'Active ingestion job not found'; end if;
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
  chunk jsonb;
  inserted_count integer := 0;
begin
  select document_version_id into target_version_id
  from public.ingestion_jobs
  where id = p_job_id and status = 'RUNNING'
  for update;
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
      (chunk->>'workspaceId')::uuid,
      target_version_id,
      (chunk->>'ordinal')::integer,
      chunk->>'content',
      chunk->>'embeddingText',
      chunk->>'contentSha256',
      (chunk->>'tokenCount')::integer,
      coalesce(array(select jsonb_array_elements_text(chunk->'sectionPath')), '{}'),
      (chunk->>'pageStart')::integer,
      (chunk->>'pageEnd')::integer,
      (chunk->>'blockStart')::integer,
      (chunk->>'blockEnd')::integer,
      coalesce(chunk->'metadata', '{}'::jsonb),
      (chunk->'embedding')::text::extensions.vector(1536),
      'text-embedding-3-small'
    );
    inserted_count := inserted_count + 1;
  end loop;

  update public.document_versions
  set parse_status = 'READY', parse_metadata = coalesce(p_parse_metadata, '{}'::jsonb),
      parsing_warnings = coalesce(p_parsing_warnings, '[]'::jsonb),
      total_pages = p_total_pages, total_chunks = inserted_count,
      indexed_at = now(), processing_error = null
  where id = target_version_id;

  update public.ingestion_jobs
  set status = 'SUCCEEDED', locked_at = null, locked_by = null, last_error = null
  where id = p_job_id;
end;
$$;

create or replace function public.fail_ingestion_job(
  p_job_id uuid,
  p_error jsonb,
  p_retryable boolean,
  p_needs_ocr boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.ingestion_jobs;
  next_status public.document_parse_status;
begin
  select * into job from public.ingestion_jobs where id = p_job_id for update;
  if job.id is null then raise exception 'Ingestion job not found'; end if;

  if p_needs_ocr then
    next_status := 'NEEDS_OCR';
  elsif p_retryable and job.attempts < 3 then
    next_status := 'QUEUED';
  else
    next_status := 'FAILED';
  end if;

  update public.document_versions
  set parse_status = next_status, processing_error = p_error
  where id = job.document_version_id;

  if next_status = 'QUEUED' then
    update public.ingestion_jobs
    set status = 'RETRY', available_at = now() + make_interval(secs => power(2, attempts)::integer * 30),
        locked_at = null, locked_by = null, last_error = p_error
    where id = p_job_id;
  else
    update public.ingestion_jobs
    set status = 'FAILED', locked_at = null, locked_by = null, last_error = p_error
    where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.create_workspace(uuid, text) from public;
revoke all on function public.register_document_upload(uuid, uuid, uuid, uuid, text, text[], text, text, bigint, text, text, text) from public;
revoke all on function public.queue_document_ingestion(uuid) from public;
revoke all on function public.claim_ingestion_job(text) from public;
revoke all on function public.set_ingestion_stage(uuid, public.document_parse_status) from public;
revoke all on function public.complete_document_ingestion(uuid, jsonb, jsonb, jsonb, integer) from public;
revoke all on function public.fail_ingestion_job(uuid, jsonb, boolean, boolean) from public;

grant execute on function public.create_workspace(uuid, text) to service_role;
grant execute on function public.register_document_upload(uuid, uuid, uuid, uuid, text, text[], text, text, bigint, text, text, text) to service_role;
grant execute on function public.queue_document_ingestion(uuid) to service_role;
grant execute on function public.claim_ingestion_job(text) to service_role;
grant execute on function public.set_ingestion_stage(uuid, public.document_parse_status) to service_role;
grant execute on function public.complete_document_ingestion(uuid, jsonb, jsonb, jsonb, integer) to service_role;
grant execute on function public.fail_ingestion_job(uuid, jsonb, boolean, boolean) to service_role;
