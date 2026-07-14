comment on column public.document_versions.parsed_storage_path is
  'Reserved for a future persisted parsed-artifact feature; currently not populated by ingestion.';
comment on column public.document_versions.parser_name is
  'Reserved parser provenance; current ingestion uses kordoc and does not override this default.';
comment on column public.document_versions.chunker_version is
  'Reserved chunker provenance; current ingestion uses structural-v1 and does not override this default.';
comment on column public.document_versions.embedding_dimensions is
  'Embedding profile invariant reserved for future profile migrations; current model is fixed at 1536.';
comment on table public.retrieval_run_hits is
  'Write-side retrieval audit trail retained for ranking regression and explainability; no end-user API reads it.';
