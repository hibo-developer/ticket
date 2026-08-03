create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete restrict,
  full_name text,
  app_role text not null default 'user',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.module_toggles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  module_id text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (org_id, module_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  unique (org_id, name)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null,
  unique (role_id, permission_key)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  unique (user_id, role_id)
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  status text not null default 'draft',
  ticket_date date,
  amount numeric(16,2),
  currency text default 'EUR',
  vendor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_org_date_idx
  on public.tickets (org_id, ticket_date desc);

create table if not exists public.ticket_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  filename text not null,
  mimetype text,
  byte_size bigint,
  storage_bucket text not null default 'tickets-cotepa',
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);

create index if not exists ticket_files_ticket_idx
  on public.ticket_files (ticket_id);

create index if not exists ticket_files_org_idx
  on public.ticket_files (org_id, created_at desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_user_id uuid not null references auth.users(id) on delete restrict,
  state text not null default 'draft',
  expense_date date,
  total_amount numeric(16,2),
  currency text default 'EUR',
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_org_date_idx
  on public.expenses (org_id, expense_date desc);

create table if not exists public.expense_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  unique (expense_id, ticket_id)
);

create table if not exists public.ui_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  view_key text not null,
  entity_key text not null,
  view_type text not null,
  schema jsonb not null default '{}'::jsonb,
  layout jsonb not null default '{}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  applies_to_role text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (org_id, view_key)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid default auth.uid(),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_org_created_idx
  on public.audit_log (org_id, created_at desc);

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((p.app_role = 'admin') and p.active, false) from public.profiles p where p.id = auth.uid()
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.module_toggles enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_files enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_tickets enable row level security;
alter table public.ui_views enable row level security;
alter table public.audit_log enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

create policy organizations_select
on public.organizations
for select
to authenticated
using (id = public.current_org_id());

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

create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid() or (org_id = public.current_org_id() and public.is_admin()));

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (org_id = public.current_org_id());

create policy module_toggles_rw_admin
on public.module_toggles
for all
to authenticated
using (org_id = public.current_org_id() and public.is_admin())
with check (org_id = public.current_org_id() and public.is_admin());

create policy roles_rw_admin
on public.roles
for all
to authenticated
using (org_id = public.current_org_id() and public.is_admin())
with check (org_id = public.current_org_id() and public.is_admin());

create policy role_permissions_rw_admin
on public.role_permissions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy user_roles_rw_admin
on public.user_roles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy tickets_select_org
on public.tickets
for select
to authenticated
using (org_id = public.current_org_id());

create policy tickets_insert_owner
on public.tickets
for insert
to authenticated
with check (org_id = public.current_org_id() and owner_user_id = auth.uid());

create policy tickets_update_owner
on public.tickets
for update
to authenticated
using (org_id = public.current_org_id() and (owner_user_id = auth.uid() or public.is_admin()))
with check (org_id = public.current_org_id());

create policy tickets_delete_owner
on public.tickets
for delete
to authenticated
using (org_id = public.current_org_id() and (owner_user_id = auth.uid() or public.is_admin()));

create policy ticket_files_select_org
on public.ticket_files
for select
to authenticated
using (org_id = public.current_org_id());

create policy ticket_files_insert_org
on public.ticket_files
for insert
to authenticated
with check (org_id = public.current_org_id());

create policy ticket_files_delete_admin
on public.ticket_files
for delete
to authenticated
using (org_id = public.current_org_id() and public.is_admin());

create policy expenses_select_org
on public.expenses
for select
to authenticated
using (org_id = public.current_org_id());

create policy expenses_insert_owner
on public.expenses
for insert
to authenticated
with check (org_id = public.current_org_id() and employee_user_id = auth.uid());

create policy expenses_update_owner
on public.expenses
for update
to authenticated
using (org_id = public.current_org_id() and (employee_user_id = auth.uid() or public.is_admin()))
with check (org_id = public.current_org_id());

create policy expense_tickets_rw_org
on public.expense_tickets
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

create policy ui_views_rw_admin
on public.ui_views
for all
to authenticated
using (org_id = public.current_org_id() and public.is_admin())
with check (org_id = public.current_org_id() and public.is_admin());

create policy audit_log_insert_org
on public.audit_log
for insert
to authenticated
with check (org_id = public.current_org_id());

create policy audit_log_select_admin
on public.audit_log
for select
to authenticated
using (org_id = public.current_org_id() and public.is_admin());

insert into storage.buckets (id, name, public)
values ('tickets-cotepa', 'tickets-cotepa', false)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

create or replace function public.current_org_prefix()
returns text
language sql
stable
set search_path = public
as $$
  select 'org_' || public.current_org_id()::text
$$;

create policy storage_objects_select_own_org
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
);

create policy storage_objects_insert_own_org
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
);

create policy storage_objects_update_own_org
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
)
with check (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
);

create policy storage_objects_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tickets-cotepa'
  and split_part(name, '/', 1) = public.current_org_prefix()
  and public.is_admin()
);
