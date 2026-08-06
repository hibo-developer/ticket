alter table public.expenses enable row level security;

drop policy if exists expenses_select_org on public.expenses;
create policy expenses_select_org
on public.expenses
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = expenses.org_id
  )
);

drop policy if exists expenses_insert_owner on public.expenses;
create policy expenses_insert_owner
on public.expenses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = expenses.org_id
  )
  and expenses.employee_user_id = auth.uid()
);

drop policy if exists expenses_update_owner on public.expenses;
create policy expenses_update_owner
on public.expenses
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = expenses.org_id
  )
  and (
    expenses.employee_user_id = auth.uid()
    or exists (
      select 1
      from public.profiles adm
      where adm.id = auth.uid()
        and adm.app_role = 'admin'
        and adm.active = true
    )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = expenses.org_id
  )
);

drop policy if exists expenses_delete_owner on public.expenses;
create policy expenses_delete_owner
on public.expenses
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = expenses.org_id
  )
  and (
    expenses.employee_user_id = auth.uid()
    or exists (
      select 1
      from public.profiles adm
      where adm.id = auth.uid()
        and adm.app_role = 'admin'
        and adm.active = true
    )
  )
);

grant select, insert, update, delete on public.expenses to authenticated;
