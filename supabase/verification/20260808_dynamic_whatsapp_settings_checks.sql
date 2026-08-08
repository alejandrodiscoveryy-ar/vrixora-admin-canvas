-- Run only in an isolated/local database after applying
-- 20260808130000_dynamic_whatsapp_project_settings.sql.
-- Replace the placeholders with test identities and an active project.
-- Each write scenario is rolled back.

-- Static permission boundary.
do $$
begin
  if not exists(select 1 from public.project_role_permissions
    where role_code='owner' and permission_code='whatsapp_settings.manage') then
    raise exception 'TEST_FAILED: owner cannot manage WhatsApp settings';
  end if;
  if exists(select 1 from public.project_role_permissions
    where role_code in('accounting','marketing') and permission_code='whatsapp_settings.manage') then
    raise exception 'TEST_FAILED: non-owner can manage WhatsApp settings';
  end if;
  if has_table_privilege('anon','public.project_whatsapp_settings','SELECT')
    or has_table_privilege('authenticated','public.project_whatsapp_settings','SELECT') then
    raise exception 'TEST_FAILED: private WhatsApp table is directly readable';
  end if;
end $$;

-- OWNER: update and read; fallback resolves for both channels.
begin;
select set_config('request.jwt.claim.sub',':owner_user_id',true);
select public.admin_update_whatsapp_settings(
  ':project_id'::uuid,'+5355555555',null,null,
  'Contactar soporte','Pagar o renovar',
  'Hola {{nombre}}, soporte de {{aplicacion}}.',
  'Solicitud {{tipo_solicitud}} de {{nombre}} para {{aplicacion}}. Licencia {{licencia}}.',
  true,true
);
do $$ declare payload jsonb;
begin
  payload:=public.admin_get_whatsapp_settings(':project_id'::uuid);
  if payload->>'fallback_number'<>'+5355555555' then
    raise exception 'TEST_FAILED: owner read/update'; end if;
  payload:=public.get_public_whatsapp_settings(':project_id'::uuid);
  if payload#>>'{support,number}'<>'+5355555555'
    or payload#>>'{payment,number}'<>'+5355555555' then
    raise exception 'TEST_FAILED: fallback resolution'; end if;
  if payload ? 'updated_by' or payload ? 'fallback_number'
    or payload ? 'support_number' or payload ? 'payment_number' then
    raise exception 'TEST_FAILED: public payload exposes administrative fields'; end if;
  if not(payload ? 'version' and payload ? 'updated_at') then
    raise exception 'TEST_FAILED: cache metadata missing'; end if;
end $$;
rollback;

-- ACCOUNTING: public projection is readable, global update is rejected.
begin;
select set_config('request.jwt.claim.sub',':accounting_user_id',true);
select public.get_public_whatsapp_settings(':project_id'::uuid);
select public.admin_update_whatsapp_settings(
  ':project_id'::uuid,'+5355555555',null,null,'Soporte','Pagar',
  'Hola {{nombre}}','Hola {{nombre}}',true,true
);
-- Expect PERMISSION_DENIED:whatsapp_settings.manage.
rollback;

-- MARKETING: update is rejected.
begin;
select set_config('request.jwt.claim.sub',':marketing_user_id',true);
select public.admin_update_whatsapp_settings(
  ':project_id'::uuid,'+5355555555',null,null,'Soporte','Pagar',
  'Hola {{nombre}}','Hola {{nombre}}',true,true
);
-- Expect PERMISSION_DENIED:whatsapp_settings.manage.
rollback;

-- OWNER: invalid number is rejected.
begin;
select set_config('request.jwt.claim.sub',':owner_user_id',true);
select public.admin_update_whatsapp_settings(
  ':project_id'::uuid,'5355555555',null,null,'Soporte','Pagar',
  'Hola {{nombre}}','Hola {{nombre}}',true,true
);
-- Expect INVALID_WHATSAPP_FALLBACK_NUMBER.
rollback;

-- OWNER: unsupported or malformed variables are rejected.
begin;
select set_config('request.jwt.claim.sub',':owner_user_id',true);
select public.admin_update_whatsapp_settings(
  ':project_id'::uuid,'+5355555555',null,null,'Soporte','Pagar',
  'Hola {{secreto}}','Hola {{nombre}}',true,true
);
-- Expect WHATSAPP_TEMPLATE_VARIABLE_NOT_ALLOWED:secreto.
rollback;
