alter policy profiles_update_self
on public.profiles
using (
  id = auth.uid()
  or (org_id = private.current_org_id() and private.is_admin())
)
with check (org_id = private.current_org_id());

alter policy role_permissions_rw_admin
on public.role_permissions
using (
  private.is_admin()
  and exists (
    select 1
    from public.roles r
    where r.id = public.role_permissions.role_id
      and r.org_id = private.current_org_id()
  )
)
with check (
  private.is_admin()
  and exists (
    select 1
    from public.roles r
    where r.id = public.role_permissions.role_id
      and r.org_id = private.current_org_id()
  )
);

alter policy user_roles_rw_admin
on public.user_roles
using (
  private.is_admin()
  and exists (
    select 1
    from public.roles r
    where r.id = public.user_roles.role_id
      and r.org_id = private.current_org_id()
  )
  and exists (
    select 1
    from public.profiles p
    where p.id = public.user_roles.user_id
      and p.org_id = private.current_org_id()
  )
)
with check (
  private.is_admin()
  and exists (
    select 1
    from public.roles r
    where r.id = public.user_roles.role_id
      and r.org_id = private.current_org_id()
  )
  and exists (
    select 1
    from public.profiles p
    where p.id = public.user_roles.user_id
      and p.org_id = private.current_org_id()
  )
);

