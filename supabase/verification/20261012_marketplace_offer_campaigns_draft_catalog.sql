-- Ejecutar solo despues de instalar la migracion, sin modificar datos.
do $verify$
begin
  if to_regclass('public.marketplace_offer_campaigns') is null
    or to_regclass('public.marketplace_offer_campaign_events') is null then
    raise exception 'OFFER_VERIFY_TABLE_MISSING';
  end if;
  if not exists(select 1 from pg_class c where c.oid='public.marketplace_offer_campaigns'::regclass and c.relrowsecurity)
    or not exists(select 1 from pg_class c where c.oid='public.marketplace_offer_campaign_events'::regclass and c.relrowsecurity) then
    raise exception 'OFFER_VERIFY_RLS_MISSING';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.marketplace_offer_campaigns'::regclass and pg_get_constraintdef(oid) like '%archived%') then
    raise exception 'OFFER_VERIFY_STATE_GUARD_MISSING';
  end if;
  if exists(select 1 from public.marketplace_offer_campaigns where status not in ('draft','paused','archived')) then
    raise exception 'OFFER_VERIFY_UNEXPECTED_ACTIVE_CAMPAIGN';
  end if;
  if to_regprocedure('public.admin_list_marketplace_offer_campaigns(uuid)') is null
     or to_regprocedure('public.admin_archive_marketplace_offer_campaign(uuid,uuid,text)') is null then
    raise exception 'OFFER_VERIFY_RPC_MISSING';
  end if;
  if has_function_privilege('anon','public.admin_list_marketplace_offer_campaigns(uuid)','EXECUTE')
    or has_table_privilege('authenticated','public.marketplace_offer_campaigns','INSERT')
    or has_table_privilege('anon','public.marketplace_offer_campaign_events','SELECT') then
    raise exception 'OFFER_VERIFY_EXCESSIVE_PERMISSIONS';
  end if;
end;
$verify$;
