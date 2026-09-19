-- TukTuk Marketplace V1, Block 2: legacy TukTuk Control vehicle projection.
-- This bridge intentionally owns only legacy fields; Marketplace enrichment stays untouched.

create or replace function app_private.project_legacy_vehicle_from_sync_entity(
  legacy_sync_entity public.sync_entities
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tuktuk_project_id uuid;
  legacy_vehicle_id text;
  legacy_name text;
  legacy_registration text;
  legacy_initial_odometer numeric;
  legacy_created_at timestamptz;
  legacy_deleted_at timestamptz;
  payload_deleted_at text;
begin
  -- Keep the historical ID byte-for-byte; only blank IDs are ineligible.
  legacy_vehicle_id := legacy_sync_entity.entity_id;
  if legacy_vehicle_id is null or btrim(legacy_vehicle_id) = '' then
    return;
  end if;

  select project.id
  into tuktuk_project_id
  from public.projects project
  where project.slug = 'tuktuk-control';

  if tuktuk_project_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.profiles profile where profile.id = legacy_sync_entity.user_id
  ) then
    return;
  end if;

  -- JSON extraction is harmless for a non-object payload. Casts are deliberately guarded
  -- so malformed historical data never breaks an otherwise valid Control synchronization.
  legacy_name := nullif(btrim(legacy_sync_entity.payload ->> 'name'), '');
  legacy_registration := nullif(btrim(legacy_sync_entity.payload ->> 'registration'), '');

  if nullif(btrim(legacy_sync_entity.payload ->> 'initialOdometer'), '')
       ~ '^[0-9]+(\.[0-9]+)?$' then
    begin
      legacy_initial_odometer := btrim(legacy_sync_entity.payload ->> 'initialOdometer')::numeric;
    exception
      when numeric_value_out_of_range then
        legacy_initial_odometer := null;
    end;
  end if;

  if nullif(btrim(legacy_sync_entity.payload ->> 'createdAt'), '') is not null then
    begin
      legacy_created_at := (legacy_sync_entity.payload ->> 'createdAt')::timestamptz;
    exception
      when others then
        legacy_created_at := null;
    end;
  end if;

  -- sync_entities.deleted_at is authoritative when present. A valid payload timestamp
  -- is used only when the sync row has no deletion timestamp.
  legacy_deleted_at := legacy_sync_entity.deleted_at;
  payload_deleted_at := nullif(btrim(legacy_sync_entity.payload ->> 'deletedAt'), '');
  if legacy_deleted_at is null and payload_deleted_at is not null then
    begin
      legacy_deleted_at := payload_deleted_at::timestamptz;
    exception
      when others then
        legacy_deleted_at := null;
    end;
  end if;

  insert into public.vehicles as target_vehicle (
    project_id,
    id,
    owner_user_id,
    name,
    registration,
    initial_odometer,
    created_at,
    deleted_at
  ) values (
    tuktuk_project_id,
    legacy_vehicle_id,
    legacy_sync_entity.user_id,
    legacy_name,
    legacy_registration,
    legacy_initial_odometer,
    coalesce(legacy_created_at, now()),
    legacy_deleted_at
  )
  on conflict (project_id, id) do update
  set name = excluded.name,
      registration = excluded.registration,
      initial_odometer = excluded.initial_odometer,
      deleted_at = excluded.deleted_at
  -- A legacy client must never be able to reassign an existing relational vehicle
  -- simply by submitting another user's text vehicle ID.
  where target_vehicle.owner_user_id = excluded.owner_user_id;
end;
$$;

create or replace function app_private.project_legacy_vehicle_sync_entity_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.project_legacy_vehicle_from_sync_entity(new);
  return new;
end;
$$;

revoke all on function app_private.project_legacy_vehicle_from_sync_entity(public.sync_entities)
  from public, anon, authenticated;
revoke all on function app_private.project_legacy_vehicle_sync_entity_trigger()
  from public, anon, authenticated;

create trigger sync_entities_project_legacy_vehicle
after insert or update of entity_type, entity_id, user_id, payload, deleted_at on public.sync_entities
for each row
when (new.entity_type = 'vehicle')
execute function app_private.project_legacy_vehicle_sync_entity_trigger();

-- Reuse the exact projection function for an idempotent historical backfill.
do $$
declare
  legacy_sync_entity public.sync_entities%rowtype;
begin
  for legacy_sync_entity in
    select sync_entity.*
    from public.sync_entities sync_entity
    where sync_entity.entity_type = 'vehicle'
  loop
    perform app_private.project_legacy_vehicle_from_sync_entity(legacy_sync_entity);
  end loop;
end;
$$;
