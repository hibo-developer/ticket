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
    raise exception 'No autorizado';
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

create or replace function public.recreate_ticket_failed(p_ticket_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_org_id uuid;
  v_old public.tickets%rowtype;
  v_new_id uuid;
begin
  v_org_id := private.current_org_id();

  select *
  into v_old
  from public.tickets t
  where t.id = p_ticket_id
    and t.org_id = v_org_id
    and t.deleted_at is null;

  if not found then
    raise exception 'Ticket no encontrado';
  end if;

  if v_old.owner_user_id <> auth.uid() and not private.is_admin() then
    raise exception 'No autorizado';
  end if;

  insert into public.tickets (
    org_id,
    owner_user_id,
    title,
    status,
    ticket_date,
    amount,
    currency,
    vendor,
    recreated_from_ticket_id,
    created_at,
    updated_at
  )
  values (
    v_old.org_id,
    auth.uid(),
    v_old.title,
    'draft',
    v_old.ticket_date,
    v_old.amount,
    v_old.currency,
    v_old.vendor,
    v_old.id,
    now(),
    now()
  )
  returning id into v_new_id;

  insert into public.ticket_files (
    org_id,
    ticket_id,
    filename,
    mimetype,
    byte_size,
    storage_bucket,
    storage_path,
    sha256,
    created_at
  )
  select
    tf.org_id,
    v_new_id,
    tf.filename,
    tf.mimetype,
    tf.byte_size,
    tf.storage_bucket,
    tf.storage_path,
    tf.sha256,
    now()
  from public.ticket_files tf
  where tf.org_id = v_old.org_id
    and tf.ticket_id = v_old.id;

  insert into public.audit_log (org_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    v_old.org_id,
    auth.uid(),
    'TICKET_RECREATE',
    'ticket',
    v_new_id,
    jsonb_build_object(
      'from_ticket_id', v_old.id,
      'from_status', v_old.status,
      'from_error_code', v_old.error_code
    )
  );

  return v_new_id;
end;
$$;

revoke all on function public.recreate_ticket_failed(uuid) from public, anon;
grant execute on function public.recreate_ticket_failed(uuid) to authenticated;

