grant usage on schema storage to authenticated, service_role;
grant select, insert, update, delete on storage.buckets to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('tickets-cotepa', 'tickets-cotepa', false, 15728640)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = null;

drop policy if exists storage_objects_select_own_org on storage.objects;
create policy storage_objects_select_own_org
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and split_part(storage.objects.name, '/', 1) = 'org_' || p.org_id::text
  )
);

drop policy if exists storage_objects_insert_own_org on storage.objects;
create policy storage_objects_insert_own_org
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tickets-cotepa'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and split_part(storage.objects.name, '/', 1) = 'org_' || p.org_id::text
  )
);

drop policy if exists storage_objects_update_own_org on storage.objects;
create policy storage_objects_update_own_org
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and split_part(storage.objects.name, '/', 1) = 'org_' || p.org_id::text
  )
)
with check (
  bucket_id = 'tickets-cotepa'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and split_part(storage.objects.name, '/', 1) = 'org_' || p.org_id::text
  )
);

drop policy if exists storage_objects_delete_admin on storage.objects;
create policy storage_objects_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and split_part(storage.objects.name, '/', 1) = 'org_' || p.org_id::text
      and p.app_role = 'admin'
      and p.active = true
  )
);
