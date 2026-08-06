-- Migración 0011: garantías previas para funcionamiento correcto de admin-create-user en remoto.
-- Idempotente: safe de ejecutar múltiples veces.

-- 1) Columna username en public.profiles (si user_management.sql no se aplicó en remoto)
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_org_username_key
  on public.profiles (org_id, lower(username))
  where username is not null and username <> '';

-- 2) Asegurar que exista trigger auth.users -> public.handle_new_user
--    Usamos la versión team (con org_id desde user_metadata + org/roles/permisos por defecto)
do $$
begin
  -- 2a) Borrar trigger viejo si existiera
  if exists (
    select 1 from pg_trigger
    where not tgisinternal
      and tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_created'
  ) then
    drop trigger if exists on_auth_user_created on auth.users;
  end if;
end $$;

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
  v_app_role text;
begin
  if exists (select 1 from public.profiles p where p.id = new.id) then
    return new;
  end if;

  v_full_name := nullif(new.raw_user_meta_data->>'full_name', '');
  v_username  := nullif(new.raw_user_meta_data->>'username', '');
  v_app_role  := coalesce(nullif(new.raw_user_meta_data->>'app_role', ''), 'user');
  if v_app_role not in ('admin','user') then v_app_role := 'user'; end if;

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
    case when v_created_new_org then 'admin' else v_app_role end,
    true
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    username  = coalesce(excluded.username,  public.profiles.username),
    app_role  = case when v_created_new_org then 'admin' else excluded.app_role end,
    active    = true;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- 3) RPC admin_check_user_availability (idempotente: drop + create para evitar 42P13 por cambio retorno)
--    Dropeamos firma con 1 y 2 args por si existía variante con DEFAULT en producción
drop function if exists public.admin_check_user_availability(text);
drop function if exists public.admin_check_user_availability(text,text);

create function public.admin_check_user_availability(p_email text, p_username text default null)
returns table(email_taken boolean, username_taken boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
begin
  email_taken    := exists (select 1 from auth.users au where lower(au.email) = v_email);
  username_taken := false;
  if p_username is not null and p_username <> '' then
    username_taken := exists (
      select 1 from public.profiles p where lower(p.username) = lower(trim(p_username))
    );
  end if;
  return next;
end;
$$;

do $$
begin
  -- Revoke y grant a ambas posibles firmas. Si alguna no existe ignoramos error
  -- para que la migración sea 100% idempotente aunque Postgres registre 1 o 2 entradas.
  begin
    execute 'revoke execute on function public.admin_check_user_availability(text) from public, anon';
  exception when others then null;
  end;
  begin
    execute 'revoke execute on function public.admin_check_user_availability(text,text) from public, anon';
  exception when others then null;
  end;
  begin
    execute 'grant execute on function public.admin_check_user_availability(text) to authenticated, service_role';
  exception when others then null;
  end;
  begin
    execute 'grant execute on function public.admin_check_user_availability(text,text) to authenticated, service_role';
  exception when others then null;
  end;
end $$;
