alter table public.retrieval_run_hits
  drop constraint if exists retrieval_run_hits_chunk_id_fkey;

alter table public.retrieval_run_hits
  add constraint retrieval_run_hits_chunk_id_fkey
  foreign key (chunk_id)
  references public.document_chunks(id)
  on delete cascade;

comment on constraint retrieval_run_hits_chunk_id_fkey on public.retrieval_run_hits is
  'Retrieval hit audit rows are removed when document chunks are regenerated during manual re-indexing.';
