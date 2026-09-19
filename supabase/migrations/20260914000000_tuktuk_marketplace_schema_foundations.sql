-- TukTuk Marketplace V1, Block 1: additive relational foundations only.

create table public.vehicle_categories (
  project_id uuid not null references public.projects(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, code)
);

create table public.propulsion_types (
  project_id uuid not null references public.projects(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, code)
);

create table public.service_types (
  project_id uuid not null references public.projects(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, code)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  owner_user_id uuid references public.profiles(id) on delete set null,
  asset_kind text not null check (btrim(asset_kind) <> ''),
  storage_bucket text not null check (btrim(storage_bucket) <> ''),
  storage_path text not null check (btrim(storage_path) <> ''),
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-fA-F]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'available', 'unavailable', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, storage_bucket, storage_path)
);

create table public.driver_profiles (
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'incomplete'
    check (status in ('incomplete', 'pending_topup', 'active', 'suspended')),
  photo_asset_id uuid,
  suspended_at timestamptz,
  suspension_reason text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, photo_asset_id)
    references public.media_assets(project_id, id) on delete restrict,
  check (
    (status = 'suspended' and suspended_at is not null)
    or (status <> 'suspended' and suspended_at is null)
  )
);

create table public.vehicles (
  -- id preserves the legacy VehicleProfile.id / sync_entities vehicle_id verbatim.
  -- Identity is project-scoped so the same legacy text ID can safely exist in different projects.
  id text not null check (btrim(id) <> ''),
  project_id uuid not null references public.projects(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  name text,
  registration text,
  initial_odometer numeric check (initial_odometer is null or initial_odometer >= 0),
  category_code text,
  propulsion_code text,
  category_other_description text,
  brand text,
  model text,
  year integer check (year is null or year between 1886 and 2200),
  passenger_capacity integer check (passenger_capacity is null or passenger_capacity >= 0),
  cargo_capacity_kg numeric check (cargo_capacity_kg is null or cargo_capacity_kg >= 0),
  cargo_volume_m3 numeric check (cargo_volume_m3 is null or cargo_volume_m3 >= 0),
  body_type text,
  main_photo_asset_id uuid,
  marketplace_status text not null default 'incomplete'
    check (marketplace_status in ('incomplete', 'pending_activation', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (project_id, id),
  foreign key (project_id, category_code)
    references public.vehicle_categories(project_id, code) on delete restrict,
  foreign key (project_id, propulsion_code)
    references public.propulsion_types(project_id, code) on delete restrict,
  foreign key (project_id, main_photo_asset_id)
    references public.media_assets(project_id, id) on delete restrict,
  check (
    category_code is distinct from 'other'
    or nullif(btrim(category_other_description), '') is not null
  )
);

create table public.driver_vehicle_assignments (
  project_id uuid not null references public.projects(id) on delete restrict,
  driver_user_id uuid not null,
  vehicle_id text not null,
  is_active boolean not null default true,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, driver_user_id, vehicle_id),
  foreign key (project_id, driver_user_id)
    references public.driver_profiles(project_id, user_id) on delete restrict,
  foreign key (project_id, vehicle_id)
    references public.vehicles(project_id, id) on delete restrict,
  check (not is_available or is_active)
);

create table public.vehicle_services (
  project_id uuid not null references public.projects(id) on delete restrict,
  vehicle_id text not null,
  service_code text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, vehicle_id, service_code),
  foreign key (project_id, vehicle_id)
    references public.vehicles(project_id, id) on delete restrict,
  foreign key (project_id, service_code)
    references public.service_types(project_id, code) on delete restrict
);

create trigger vehicle_categories_set_updated_at before update on public.vehicle_categories
for each row execute function app_private.set_updated_at();
create trigger propulsion_types_set_updated_at before update on public.propulsion_types
for each row execute function app_private.set_updated_at();
create trigger service_types_set_updated_at before update on public.service_types
for each row execute function app_private.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets
for each row execute function app_private.set_updated_at();
create trigger driver_profiles_set_updated_at before update on public.driver_profiles
for each row execute function app_private.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute function app_private.set_updated_at();
create trigger driver_vehicle_assignments_set_updated_at before update on public.driver_vehicle_assignments
for each row execute function app_private.set_updated_at();
create trigger vehicle_services_set_updated_at before update on public.vehicle_services
for each row execute function app_private.set_updated_at();

insert into public.vehicle_categories (project_id, code, name, sort_order)
select project.id, seed.code, seed.name, seed.sort_order
from public.projects project
cross join (values
  ('light_car', 'Auto ligero', 10),
  ('tricycle', 'Triciclo', 20),
  ('motorcycle', 'Motocicleta', 30),
  ('van', 'Furgoneta', 40),
  ('truck', 'Camión', 50),
  ('other', 'Otro', 60)
) as seed(code, name, sort_order)
where project.slug = 'tuktuk-control'
on conflict (project_id, code) do nothing;

insert into public.propulsion_types (project_id, code, name, sort_order)
select project.id, seed.code, seed.name, seed.sort_order
from public.projects project
cross join (values
  ('electric', 'Eléctrico', 10),
  ('combustion', 'Combustión', 20),
  ('hybrid', 'Híbrido', 30)
) as seed(code, name, sort_order)
where project.slug = 'tuktuk-control'
on conflict (project_id, code) do nothing;

insert into public.service_types (project_id, code, name, sort_order)
select project.id, seed.code, seed.name, seed.sort_order
from public.projects project
cross join (values
  ('passenger', 'Pasajeros', 10),
  ('cargo', 'Carga', 20),
  ('courier', 'Mensajería', 30),
  ('tourism', 'Turismo', 40)
) as seed(code, name, sort_order)
where project.slug = 'tuktuk-control'
on conflict (project_id, code) do nothing;

create index vehicles_project_owner_idx on public.vehicles(project_id, owner_user_id)
  where deleted_at is null;
create index vehicles_marketplace_lookup_idx
  on public.vehicles(project_id, marketplace_status, category_code, propulsion_code)
  where deleted_at is null;
create index driver_profiles_project_status_idx on public.driver_profiles(project_id, status);
create index driver_vehicle_assignments_driver_availability_idx
  on public.driver_vehicle_assignments(project_id, driver_user_id)
  where is_active and is_available;
create index driver_vehicle_assignments_vehicle_idx
  on public.driver_vehicle_assignments(project_id, vehicle_id)
  where is_active;
create index vehicle_services_enabled_lookup_idx
  on public.vehicle_services(project_id, service_code, vehicle_id)
  where enabled;
create index media_assets_project_owner_idx on public.media_assets(project_id, owner_user_id);

alter table public.vehicle_categories enable row level security;
alter table public.propulsion_types enable row level security;
alter table public.service_types enable row level security;
alter table public.media_assets enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.driver_vehicle_assignments enable row level security;
alter table public.vehicle_services enable row level security;

revoke all on public.vehicle_categories from public, anon, authenticated;
revoke all on public.propulsion_types from public, anon, authenticated;
revoke all on public.service_types from public, anon, authenticated;
revoke all on public.media_assets from public, anon, authenticated;
revoke all on public.driver_profiles from public, anon, authenticated;
revoke all on public.vehicles from public, anon, authenticated;
revoke all on public.driver_vehicle_assignments from public, anon, authenticated;
revoke all on public.vehicle_services from public, anon, authenticated;
