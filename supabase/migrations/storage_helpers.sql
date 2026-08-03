create or replace function public.current_org_prefix()
returns text
language sql
stable
set search_path = public
as $$
  select 'org_' || public.current_org_id()::text
$$;
