grant usage on schema storage to authenticated, service_role;
grant select, insert, update, delete on storage.buckets to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tickets-cotepa',
  'tickets-cotepa',
  false,
  15728640,
  array['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = coalesce(excluded.file_size_limit, storage.buckets.file_size_limit),
  allowed_mime_types = coalesce(excluded.allowed_mime_types, storage.buckets.allowed_mime_types);

drop policy if exists storage_objects_select_own_org on storage.objects;
create policy storage_objects_select_own_org
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
);

drop policy if exists storage_objects_insert_own_org on storage.objects;
create policy storage_objects_insert_own_org
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
);

drop policy if exists storage_objects_update_own_org on storage.objects;
create policy storage_objects_update_own_org
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
)
with check (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
);

drop policy if exists storage_objects_delete_admin on storage.objects;
create policy storage_objects_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
  and public.is_admin()
);
