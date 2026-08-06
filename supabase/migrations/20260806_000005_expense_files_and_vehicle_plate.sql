alter table public.expenses
  add column if not exists vehicle_plate text;

comment on column public.expenses.vehicle_plate is 'Matrícula del vehículo para gastos de combustible';

create table if not exists public.expense_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  filename text not null,
  mimetype text,
  byte_size bigint,
  storage_bucket text not null default 'tickets-cotepa',
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);

create index if not exists expense_files_expense_idx
  on public.expense_files (expense_id);

create index if not exists expense_files_org_idx
  on public.expense_files (org_id, created_at desc);

alter table public.expense_files enable row level security;

drop policy if exists expense_files_select_org on public.expense_files;
create policy expense_files_select_org
on public.expense_files
for select
to authenticated
using (org_id = public.current_org_id());

drop policy if exists expense_files_insert_owner on public.expense_files;
create policy expense_files_insert_owner
on public.expense_files
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.expenses e
    where e.id = expense_files.expense_id
      and e.org_id = public.current_org_id()
  )
);

drop policy if exists expense_files_delete_owner on public.expense_files;
create policy expense_files_delete_owner
on public.expense_files
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.is_admin()
    or exists (
      select 1
      from public.expenses e
      where e.id = expense_files.expense_id
        and e.employee_user_id = auth.uid()
    )
  )
);

grant select, insert, delete on public.expense_files to authenticated;
