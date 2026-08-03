create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((p.app_role = 'admin') and p.active, false)
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function private.current_org_prefix()
returns text
language sql
stable
set search_path = private
as $$
  select 'org_' || private.current_org_id()::text
$$;

revoke all on function private.current_org_id() from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.current_org_prefix() from public, anon;

grant execute on function private.current_org_id() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_org_prefix() to authenticated;

alter policy organizations_select
on public.organizations
using (id = private.current_org_id());

alter policy profiles_select_self
on public.profiles
using (id = auth.uid() or (org_id = private.current_org_id() and private.is_admin()));

alter policy profiles_update_self
on public.profiles
using (id = auth.uid() or private.is_admin())
with check (org_id = private.current_org_id());

alter policy module_toggles_rw_admin
on public.module_toggles
using (org_id = private.current_org_id() and private.is_admin())
with check (org_id = private.current_org_id() and private.is_admin());

alter policy roles_rw_admin
on public.roles
using (org_id = private.current_org_id() and private.is_admin())
with check (org_id = private.current_org_id() and private.is_admin());

alter policy role_permissions_rw_admin
on public.role_permissions
using (private.is_admin())
with check (private.is_admin());

alter policy user_roles_rw_admin
on public.user_roles
using (private.is_admin())
with check (private.is_admin());

alter policy tickets_select_org
on public.tickets
using (org_id = private.current_org_id());

alter policy tickets_insert_owner
on public.tickets
with check (org_id = private.current_org_id() and owner_user_id = auth.uid());

alter policy tickets_update_owner
on public.tickets
using (org_id = private.current_org_id() and (owner_user_id = auth.uid() or private.is_admin()))
with check (org_id = private.current_org_id());

alter policy tickets_delete_owner
on public.tickets
using (org_id = private.current_org_id() and (owner_user_id = auth.uid() or private.is_admin()));

alter policy ticket_files_select_org
on public.ticket_files
using (org_id = private.current_org_id());

alter policy ticket_files_insert_org
on public.ticket_files
with check (org_id = private.current_org_id());

alter policy ticket_files_delete_admin
on public.ticket_files
using (org_id = private.current_org_id() and private.is_admin());

alter policy expenses_select_org
on public.expenses
using (org_id = private.current_org_id());

alter policy expenses_insert_owner
on public.expenses
with check (org_id = private.current_org_id() and employee_user_id = auth.uid());

alter policy expenses_update_owner
on public.expenses
using (org_id = private.current_org_id() and (employee_user_id = auth.uid() or private.is_admin()))
with check (org_id = private.current_org_id());

alter policy expense_tickets_rw_org
on public.expense_tickets
using (org_id = private.current_org_id())
with check (org_id = private.current_org_id());

alter policy ui_views_rw_admin
on public.ui_views
using (org_id = private.current_org_id() and private.is_admin())
with check (org_id = private.current_org_id() and private.is_admin());

alter policy audit_log_insert_org
on public.audit_log
with check (org_id = private.current_org_id());

alter policy audit_log_select_admin
on public.audit_log
using (org_id = private.current_org_id() and private.is_admin());

alter policy storage_objects_select_own_org
on storage.objects
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = private.current_org_prefix()
);

alter policy storage_objects_insert_own_org
on storage.objects
with check (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = private.current_org_prefix()
);

alter policy storage_objects_update_own_org
on storage.objects
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = private.current_org_prefix()
)
with check (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = private.current_org_prefix()
);

alter policy storage_objects_delete_admin
on storage.objects
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = private.current_org_prefix()
  and private.is_admin()
);

revoke execute on function public.current_org_id() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
