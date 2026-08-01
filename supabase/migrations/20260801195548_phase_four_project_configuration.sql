-- Phase 4: complete per-project configuration managed by authorized administrators.

alter table public.projects
  add column if not exists logo_url text,
  add column if not exists icon_url text,
  add column if not exists primary_color text not null default '#06b6d4',
  add column if not exists secondary_color text not null default '#0f172a',
  add column if not exists whatsapp text,
  add column if not exists support_email text,
  add column if not exists website_url text,
  add column if not exists privacy_url text,
  add column if not exists terms_url text,
  add column if not exists currency text not null default 'CUP',
  add column if not exists trial_days integer not null default 30,
  add column if not exists payment_methods text[] not null default array['cash']::text[],
  add column if not exists minimum_version text,
  add column if not exists maintenance_mode boolean not null default false,
  add column if not exists force_update boolean not null default false,
  add column if not exists welcome_message text;

alter table public.projects
  drop constraint if exists projects_primary_color_check,
  add constraint projects_primary_color_check
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  drop constraint if exists projects_secondary_color_check,
  add constraint projects_secondary_color_check
    check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  drop constraint if exists projects_currency_check,
  add constraint projects_currency_check check (currency in ('CUP', 'USD', 'EUR')),
  drop constraint if exists projects_trial_days_check,
  add constraint projects_trial_days_check check (trial_days between 0 and 3650),
  drop constraint if exists projects_payment_methods_check,
  add constraint projects_payment_methods_check check (
    payment_methods <@ array['card', 'transfer', 'cash', 'paypal']::text[]
    and cardinality(payment_methods) > 0
  ),
  drop constraint if exists projects_logo_url_check,
  add constraint projects_logo_url_check check (logo_url is null or logo_url ~ '^https://'),
  drop constraint if exists projects_icon_url_check,
  add constraint projects_icon_url_check check (icon_url is null or icon_url ~ '^https://'),
  drop constraint if exists projects_website_url_check,
  add constraint projects_website_url_check check (website_url is null or website_url ~ '^https://'),
  drop constraint if exists projects_privacy_url_check,
  add constraint projects_privacy_url_check check (privacy_url is null or privacy_url ~ '^https://'),
  drop constraint if exists projects_terms_url_check,
  add constraint projects_terms_url_check check (terms_url is null or terms_url ~ '^https://');

create function public.admin_update_project_settings(
  target_project_id uuid,
  target_name text,
  target_description text,
  target_notify_license_expiry boolean,
  target_auto_renew_verified_payments boolean,
  target_logo_url text,
  target_icon_url text,
  target_primary_color text,
  target_secondary_color text,
  target_whatsapp text,
  target_support_email text,
  target_website_url text,
  target_privacy_url text,
  target_terms_url text,
  target_currency text,
  target_trial_days integer,
  target_payment_methods text[],
  target_minimum_version text,
  target_maintenance_mode boolean,
  target_force_update boolean,
  target_welcome_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_methods text[];
begin
  perform app_private.require_project_permission(target_project_id, 'settings.manage');

  if nullif(btrim(target_name), '') is null then
    raise exception 'PROJECT_NAME_REQUIRED' using errcode = '22023';
  end if;
  if target_currency not in ('CUP', 'USD', 'EUR') then
    raise exception 'INVALID_CURRENCY' using errcode = '22023';
  end if;
  if target_trial_days not between 0 and 3650 then
    raise exception 'INVALID_TRIAL_DAYS' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct method order by method), array[]::text[])
    into normalized_methods
  from unnest(coalesce(target_payment_methods, array[]::text[])) method;

  if cardinality(normalized_methods) = 0
     or not normalized_methods <@ array['card', 'transfer', 'cash', 'paypal']::text[] then
    raise exception 'INVALID_PAYMENT_METHODS' using errcode = '22023';
  end if;

  update public.projects set
    name = btrim(target_name),
    description = nullif(btrim(target_description), ''),
    notify_license_expiry = target_notify_license_expiry,
    auto_renew_verified_payments = target_auto_renew_verified_payments,
    logo_url = nullif(btrim(target_logo_url), ''),
    icon_url = nullif(btrim(target_icon_url), ''),
    primary_color = target_primary_color,
    secondary_color = target_secondary_color,
    whatsapp = nullif(btrim(target_whatsapp), ''),
    support_email = nullif(lower(btrim(target_support_email)), ''),
    website_url = nullif(btrim(target_website_url), ''),
    privacy_url = nullif(btrim(target_privacy_url), ''),
    terms_url = nullif(btrim(target_terms_url), ''),
    currency = target_currency,
    trial_days = target_trial_days,
    payment_methods = normalized_methods,
    minimum_version = nullif(btrim(target_minimum_version), ''),
    maintenance_mode = target_maintenance_mode,
    force_update = target_force_update,
    welcome_message = nullif(btrim(target_welcome_message), ''),
    updated_at = now()
  where id = target_project_id;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_update_project_settings(
  uuid, text, text, boolean, boolean, text, text, text, text, text, text,
  text, text, text, text, integer, text[], text, boolean, boolean, text
) from public, anon;

grant execute on function public.admin_update_project_settings(
  uuid, text, text, boolean, boolean, text, text, text, text, text, text,
  text, text, text, text, integer, text[], text, boolean, boolean, text
) to authenticated;
