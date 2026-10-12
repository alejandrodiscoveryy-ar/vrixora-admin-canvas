-- This migration documents the permission-parity DDL already applied to TukTuk Supabase
-- under version 20261012165343. Do not reapply it to production automatically.
-- Formal projects.owner_id ownership remains unchanged. Marketing is not elevated.
-- Replayable schema/permissions: preserves ownership and updates only known RPC guards.
insert into public.project_role_permissions(role_code,permission_code)
select 'admin', owner_rights.permission_code
from public.project_role_permissions owner_rights
where owner_rights.role_code = 'owner'
on conflict (role_code,permission_code) do nothing;

create or replace function app_private.is_project_administrator(target_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $func$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.project_members m
      where m.project_id = target_project_id
        and m.user_id = (select auth.uid())
        and m.role = 'admin'
    );
$func$;
revoke all on function app_private.is_project_administrator(uuid) from public, anon, authenticated;

-- Localized expansion of six existing RPC authorizations without changing the actual owner.
do $guards$
declare
  rec record;
  old_definition text;
  new_definition text;
  matches integer;
begin
  for rec in
    select * from (values
      ('admin_save_marketplace_offer_campaign',
       'p.owner_id=actor and p.slug=''tuktuk-control''',
       '(p.owner_id=actor or app_private.is_project_administrator(target_project_id)) and p.slug=''tuktuk-control'''),
      ('admin_archive_marketplace_offer_campaign',
       'p.owner_id=actor and p.slug=''tuktuk-control''',
       '(p.owner_id=actor or app_private.is_project_administrator(target_project_id)) and p.slug=''tuktuk-control'''),
      ('admin_apply_pending_tuktuk_referral_license_months',
       'p.slug=''tuktuk-control'' and p.owner_id=actor',
       'p.slug=''tuktuk-control'' and (p.owner_id=actor or app_private.is_project_administrator(target_project_id))'),
      ('admin_preview_tuktuk_legacy_referral_conversion',
       'p.slug=''tuktuk-control'' and p.owner_id=actor',
       'p.slug=''tuktuk-control'' and (p.owner_id=actor or app_private.is_project_administrator(target_project_id))'),
      ('admin_add_project_member_by_email',
       'auth.uid() is null or not app_private.is_project_owner(target_project_id)',
       'auth.uid() is null or not (app_private.is_project_owner(target_project_id) or app_private.is_project_administrator(target_project_id))'),
      ('renew_license',
       'if not app_private.is_project_owner(current_license.project_id) then',
       'if not (app_private.is_project_owner(current_license.project_id) or app_private.is_project_administrator(current_license.project_id)) then')
    ) as expected(name, needle, replacement)
  loop
    select pg_get_functiondef(p.oid) into old_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=rec.name and p.prokind='f';
    if old_definition is null then
      raise exception 'PARITY_FUNCTION_MISSING:%',rec.name;
    end if;
    matches := (length(old_definition)-length(replace(old_definition,rec.needle,'')))/length(rec.needle);
    if matches <> 1 then
      raise exception 'PARITY_FUNCTION_CHANGED:%:found_%',rec.name,matches;
    end if;
    new_definition := replace(old_definition,rec.needle,rec.replacement);
    execute new_definition;
  end loop;
end;
$guards$;