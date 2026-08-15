-- Fuente autoritativa de permisos para los controles de Configuración.
-- Evita que un estado de permisos desacoplado deje deshabilitados controles
-- para un owner que sí tiene settings.manage en backend.

create or replace function public.admin_get_p0a_settings(target_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');

  select jsonb_build_object(
    'project_id', target_project_id,
    'base_currency', exchange.base_currency,
    'charge_currency', exchange.charge_currency,
    'rate_mode', exchange.rate_mode,
    'current_rate', exchange.current_rate,
    'rate_source', exchange.rate_source,
    'rate_updated_at', exchange.rate_updated_at,
    'test_mode_enabled', test.enabled,
    'referral_reward_days', referral.reward_days,
    'can_manage_settings', app_private.has_project_permission(target_project_id,'settings.manage'),
    'can_manage_whatsapp', app_private.has_project_permission(target_project_id,'whatsapp_settings.manage')
  )
  into result
  from public.project_exchange_settings exchange
  join public.project_test_settings test using(project_id)
  join public.project_referral_settings referral using(project_id)
  where exchange.project_id = target_project_id;

  if result is null then
    raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke all on function public.admin_get_p0a_settings(uuid) from public,anon;
grant execute on function public.admin_get_p0a_settings(uuid) to authenticated;
