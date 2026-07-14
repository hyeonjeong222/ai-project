-- register_document_upload_v2 has been the only application caller since the
-- document lifecycle migration. Dropping v1 also removes its service_role grant.
drop function if exists public.register_document_upload(
  uuid, uuid, uuid, uuid, text, text[], text, text, bigint, text, text, text
);
