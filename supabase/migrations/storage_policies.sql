create policy storage_objects_select_own_org
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
);

create policy storage_objects_insert_own_org
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
);

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

create policy storage_objects_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
  and public.is_admin()
);
