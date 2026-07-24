create schema if not exists app_private;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  slug text not null unique check (btrim(slug) <> ''),
  description text,
  status text not null default 'planning'
    check (status in ('active', 'planning', 'paused')),
  color text not null default '205',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'employee'
    check (role in ('owner', 'employee')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  license_key text not null check (btrim(license_key) <> ''),
  status text not null default 'pending'
    check (status in ('active', 'expired', 'pending')),
  activated_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or activated_at is null or expires_at > activated_at),
  unique (project_id, license_key),
  unique (id, project_id),
  unique (id, project_id, user_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  license_id uuid,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'CUP'
    check (currency in ('CUP', 'USD', 'EUR')),
  method text not null
    check (method in ('card', 'transfer', 'cash', 'paypal')),
  reference text not null check (btrim(reference) <> ''),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, reference),
  foreign key (license_id, project_id, user_id)
    references public.licenses(id, project_id, user_id)
    on delete restrict
);

create table public.license_audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  license_id uuid not null,
  action text not null check (btrim(action) <> ''),
  detail text not null check (btrim(detail) <> ''),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (license_id, project_id)
    references public.licenses(id, project_id)
    on delete restrict
);

create index projects_owner_id_idx
  on public.projects(owner_id);
create index project_members_user_id_idx
  on public.project_members(user_id);
create index licenses_project_id_idx
  on public.licenses(project_id);
create index licenses_user_id_idx
  on public.licenses(user_id);
create index payments_project_id_idx
  on public.payments(project_id);
create index payments_user_id_idx
  on public.payments(user_id);
create index payments_license_id_idx
  on public.payments(license_id);
create index payments_recorded_by_idx
  on public.payments(recorded_by);
create index license_audit_log_project_id_idx
  on public.license_audit_log(project_id);
create index license_audit_log_license_id_idx
  on public.license_audit_log(license_id);

create or replace function app_private.is_project_owner(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects
      where id = target_project_id
        and owner_id = (select auth.uid())
    );
$$;

create or replace function app_private.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.projects
        where id = target_project_id
          and owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.project_members
        where project_id = target_project_id
          and user_id = (select auth.uid())
      )
    );
$$;

revoke all on schema app_private from public;
revoke all on function app_private.is_project_owner(uuid) from public;
revoke all on function app_private.can_access_project(uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_project_owner(uuid) to authenticated;
grant execute on function app_private.can_access_project(uuid) to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.licenses enable row level security;
alter table public.payments enable row level security;
alter table public.license_audit_log enable row level security;

revoke all on public.projects from anon, authenticated;
revoke all on public.project_members from anon, authenticated;
revoke all on public.licenses from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.license_audit_log from anon, authenticated;

grant select on public.projects to authenticated;
grant insert (owner_id, name, slug, description, status, color)
  on public.projects to authenticated;
grant update (name, slug, description, status, color, updated_at)
  on public.projects to authenticated;
grant delete on public.projects to authenticated;

grant select on public.project_members to authenticated;
grant insert (project_id, user_id, role)
  on public.project_members to authenticated;
grant update (role)
  on public.project_members to authenticated;
grant delete on public.project_members to authenticated;

grant select on public.licenses to authenticated;
grant insert (
  project_id,
  user_id,
  license_key,
  status,
  activated_at,
  expires_at,
  created_by
) on public.licenses to authenticated;
grant update (status, activated_at, expires_at, updated_at)
  on public.licenses to authenticated;
grant delete on public.licenses to authenticated;

grant select on public.payments to authenticated;
grant insert (
  project_id,
  user_id,
  license_id,
  amount,
  currency,
  method,
  reference,
  recorded_by
) on public.payments to authenticated;
grant update (license_id, amount, currency, method, reference)
  on public.payments to authenticated;
grant delete on public.payments to authenticated;

grant select on public.license_audit_log to authenticated;
grant insert (project_id, license_id, action, detail, actor_id)
  on public.license_audit_log to authenticated;

create policy "Project members can view projects"
on public.projects for select
to authenticated
using (app_private.can_access_project(id));

create policy "Authenticated users can create owned projects"
on public.projects for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Project owners can update projects"
on public.projects for update
to authenticated
using (app_private.is_project_owner(id))
with check ((select auth.uid()) = owner_id);

create policy "Project owners can delete projects"
on public.projects for delete
to authenticated
using (app_private.is_project_owner(id));

create policy "Project members can view memberships"
on public.project_members for select
to authenticated
using (app_private.can_access_project(project_id));

create policy "Project owners can add memberships"
on public.project_members for insert
to authenticated
with check (app_private.is_project_owner(project_id));

create policy "Project owners can update memberships"
on public.project_members for update
to authenticated
using (app_private.is_project_owner(project_id))
with check (app_private.is_project_owner(project_id));

create policy "Project owners can remove memberships"
on public.project_members for delete
to authenticated
using (app_private.is_project_owner(project_id));

create policy "Project members can view licenses"
on public.licenses for select
to authenticated
using (app_private.can_access_project(project_id));

create policy "Users can view their own licenses"
on public.licenses for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Project members can create licenses"
on public.licenses for insert
to authenticated
with check (
  app_private.can_access_project(project_id)
  and created_by = (select auth.uid())
);

create policy "Project members can update licenses"
on public.licenses for update
to authenticated
using (app_private.can_access_project(project_id))
with check (app_private.can_access_project(project_id));

create policy "Project owners can delete licenses"
on public.licenses for delete
to authenticated
using (app_private.is_project_owner(project_id));

create policy "Owners can view all project payments"
on public.payments for select
to authenticated
using (app_private.is_project_owner(project_id));

create policy "Employees can view their project payments"
on public.payments for select
to authenticated
using (
  recorded_by = (select auth.uid())
  and app_private.can_access_project(project_id)
);

create policy "Users can view their own payments"
on public.payments for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Project members can record payments"
on public.payments for insert
to authenticated
with check (
  recorded_by = (select auth.uid())
  and app_private.can_access_project(project_id)
);

create policy "Project owners can update payments"
on public.payments for update
to authenticated
using (app_private.is_project_owner(project_id))
with check (app_private.is_project_owner(project_id));

create policy "Project owners can delete payments"
on public.payments for delete
to authenticated
using (app_private.is_project_owner(project_id));

create policy "Project members can view license audit logs"
on public.license_audit_log for select
to authenticated
using (app_private.can_access_project(project_id));

create policy "Project members can create license audit logs"
on public.license_audit_log for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and app_private.can_access_project(project_id)
);
