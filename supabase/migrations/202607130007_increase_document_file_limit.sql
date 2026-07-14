-- Company manuals often contain detailed policies, appendices, images, and forms.
-- Keep the browser, backend validation, and private Storage bucket at the same 200MB ceiling.
update storage.buckets
set file_size_limit = 209715200
where id = 'knowledge-files';
