create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org_id uuid;
  v_org_name text;
begin
  if exists (select 1 from public.profiles p where p.id = new.id) then
    return new;
  end if;

  v_org_name :=
    coalesce(
      nullif(new.raw_user_meta_data->>'org_name', ''),
      case
        when new.email is not null and new.email <> '' then split_part(new.email, '@', 1) || ' Org'
        else 'Mi organización'
      end
    );

  insert into public.organizations (name)
  values (v_org_name)
  returning id into v_org_id;

  insert into public.profiles (id, org_id, full_name, app_role)
  values (
    new.id,
    v_org_id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    'admin'
  )
  on conflict (id) do nothing;

  insert into public.module_toggles (org_id, module_id, enabled)
  values
    (v_org_id, 'tickets', true),
    (v_org_id, 'expenses', true),
    (v_org_id, 'reports', true),
    (v_org_id, 'admin', true)
  on conflict (org_id, module_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
