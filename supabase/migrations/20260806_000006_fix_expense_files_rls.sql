grant select, insert, update, delete on public.expense_files
  to authenticated, postgres, service_role;

drop policy if exists expense_files_select_org on public.expense_files;
create policy expense_files_select_org
on public.expense_files
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = expense_files.org_id
  )
);

drop policy if exists expense_files_insert_owner on public.expense_files;
create policy expense_files_insert_owner
on public.expense_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = expense_files.org_id
  )
  and exists (
    select 1
    from public.expenses e
    where e.id = expense_files.expense_id
      and e.org_id = expense_files.org_id
      and e.employee_user_id = auth.uid()
  )
);

drop policy if exists expense_files_delete_owner on public.expense_files;
create policy expense_files_delete_owner
on public.expense_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = expense_files.org_id
  )
  and (
    private.is_admin()
    or exists (
      select 1
      from public.expenses e
      where e.id = expense_files.expense_id
        and e.org_id = expense_files.org_id
        and e.employee_user_id = auth.uid()
    )
  )
);
