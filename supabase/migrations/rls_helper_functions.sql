create or replace function public.current_org_id()
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

create or replace function public.is_admin()
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

create or replace function public.current_org_prefix()
returns text
language sql
stable
set search_path = public
as $$
  select 'org_' || public.current_org_id()::text
$$;

drop policy if exists organizations_insert on public.organizations;

create policy organizations_insert
on public.organizations
for insert
to authenticated
with check (
  not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
  )
);

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
