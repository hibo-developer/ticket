alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_org_username_key
  on public.profiles (org_id, lower(username))
  where username is not null and username <> '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org_id uuid;
  v_org_name text;
  v_requested_org_id_text text;
  v_requested_org_id uuid;
  v_created_new_org boolean := false;
  v_default_role_id uuid;
  v_full_name text;
  v_username text;
begin
  if exists (select 1 from public.profiles p where p.id = new.id) then
    return new;
  end if;

  v_full_name := nullif(new.raw_user_meta_data->>'full_name', '');
  v_username := nullif(new.raw_user_meta_data->>'username', '');

  v_requested_org_id_text := nullif(new.raw_user_meta_data->>'org_id', '');
  if v_requested_org_id_text is not null then
    begin
      v_requested_org_id := v_requested_org_id_text::uuid;
    exception
      when others then
        v_requested_org_id := null;
    end;
  end if;

  if v_requested_org_id is not null and exists (select 1 from public.organizations o where o.id = v_requested_org_id) then
    v_org_id := v_requested_org_id;
  else
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

    v_created_new_org := true;
  end if;

  insert into public.profiles (id, org_id, full_name, username, app_role, active)
  values (
    new.id,
    v_org_id,
    v_full_name,
    v_username,
    case when v_created_new_org then 'admin' else 'user' end,
    true
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    username = coalesce(excluded.username, public.profiles.username);

  insert into public.module_toggles (org_id, module_id, enabled)
  values
    (v_org_id, 'tickets', true),
    (v_org_id, 'expenses', true),
    (v_org_id, 'reports', true),
    (v_org_id, 'admin', true)
  on conflict (org_id, module_id) do nothing;

  insert into public.roles (org_id, name, description)
  values (v_org_id, 'Usuario', 'Acceso estándar')
  on conflict (org_id, name) do update set description = excluded.description
  returning id into v_default_role_id;

  insert into public.role_permissions (role_id, permission_key)
  values
    (v_default_role_id, 'tickets.read'),
    (v_default_role_id, 'tickets.write'),
    (v_default_role_id, 'tickets.download'),
    (v_default_role_id, 'expenses.read'),
    (v_default_role_id, 'expenses.write'),
    (v_default_role_id, 'reports.read')
  on conflict (role_id, permission_key) do nothing;

  if not v_created_new_org then
    insert into public.user_roles (user_id, role_id)
    values (new.id, v_default_role_id)
    on conflict (user_id, role_id) do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.admin_check_user_availability(p_email text, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_org_id uuid;
  v_email_taken boolean := false;
  v_username_taken boolean := false;
begin
  if not private.is_admin() then
    raise exception 'Forbidden';
  end if;

  v_org_id := private.current_org_id();

  if p_email is not null and btrim(p_email) <> '' then
    select exists(select 1 from auth.users u where lower(u.email) = lower(btrim(p_email))) into v_email_taken;
  end if;

  if p_username is not null and btrim(p_username) <> '' then
    select exists(
      select 1
      from public.profiles p
      where p.org_id = v_org_id
        and lower(p.username) = lower(btrim(p_username))
    ) into v_username_taken;
  end if;

  return jsonb_build_object('email_taken', v_email_taken, 'username_taken', v_username_taken);
end;
$$;

revoke all on function public.admin_check_user_availability(text, text) from public, anon;
grant execute on function public.admin_check_user_availability(text, text) to authenticated;

