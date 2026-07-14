-- Disambiguate the ingestion job attempts column from the OUT parameter with
-- the same name. PostgreSQL can otherwise raise an ambiguous reference error
-- when the worker claims a queued document.

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

  update public.ingestion_jobs as j
  set status = 'RUNNING',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id
  where j.id = claimed_job.id
  returning j.* into claimed_job;

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

revoke all on function public.claim_ingestion_job(text) from public;
grant execute on function public.claim_ingestion_job(text) to service_role;
