alter table public.expenses enable row level security;

drop policy if exists expenses_delete_owner on public.expenses;
create policy expenses_delete_owner
on public.expenses
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.is_admin()
    or employee_user_id = auth.uid()
  )
);

grant delete on public.expenses to authenticated;

drop policy if exists expense_files_rw_org on public.expense_files;
