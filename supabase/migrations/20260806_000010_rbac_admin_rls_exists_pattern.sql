alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.module_toggles enable row level security;
alter table public.ui_views enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists roles_rw_admin on public.roles;
create policy roles_rw_admin
on public.roles
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = roles.org_id
      and p.app_role = 'admin'
      and p.active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = roles.org_id
      and p.app_role = 'admin'
      and p.active = true
  )
);

drop policy if exists role_permissions_rw_admin on public.role_permissions;
create policy role_permissions_rw_admin
on public.role_permissions
for all
to authenticated
using (
  exists (
    select 1
    from public.roles r
    join public.profiles p
      on p.id = auth.uid()
     and p.org_id = r.org_id
     and p.app_role = 'admin'
     and p.active = true
    where r.id = role_permissions.role_id
  )
)
with check (
  exists (
    select 1
    from public.roles r
    join public.profiles p
      on p.id = auth.uid()
     and p.org_id = r.org_id
     and p.app_role = 'admin'
     and p.active = true
    where r.id = role_permissions.role_id
  )
);

drop policy if exists user_roles_rw_admin on public.user_roles;
create policy user_roles_rw_admin
on public.user_roles
for all
to authenticated
using (
  exists (
    select 1
    from public.roles r
    join public.profiles p
      on p.id = auth.uid()
     and p.org_id = r.org_id
     and p.app_role = 'admin'
     and p.active = true
    where r.id = user_roles.role_id
  )
)
with check (
  exists (
    select 1
    from public.roles r
    join public.profiles p
      on p.id = auth.uid()
     and p.org_id = r.org_id
     and p.app_role = 'admin'
     and p.active = true
    where r.id = user_roles.role_id
  )
);

drop policy if exists module_toggles_rw_admin on public.module_toggles;
create policy module_toggles_rw_admin
on public.module_toggles
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = module_toggles.org_id
      and p.app_role = 'admin'
      and p.active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = module_toggles.org_id
      and p.app_role = 'admin'
      and p.active = true
  )
);

drop policy if exists ui_views_rw_admin on public.ui_views;
create policy ui_views_rw_admin
on public.ui_views
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = ui_views.org_id
      and (p.app_role = 'admin' and p.active = true)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = ui_views.org_id
      and (p.app_role = 'admin' and p.active = true)
  )
);

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
on public.audit_log
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = audit_log.org_id
      and p.app_role = 'admin'
      and p.active = true
  )
);

drop policy if exists audit_log_insert_authenticated on public.audit_log;
create policy audit_log_insert_authenticated
on public.audit_log
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = audit_log.org_id
      and p.active = true
  )
);

grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select, insert, update, delete on public.module_toggles to authenticated;
grant select, insert, update, delete on public.ui_views to authenticated;
grant select, insert on public.audit_log to authenticated;
