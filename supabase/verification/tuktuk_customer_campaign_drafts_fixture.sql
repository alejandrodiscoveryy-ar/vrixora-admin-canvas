-- Disposable PostgreSQL 17 fixture. Must never run on production.
create schema app_private;
create schema auth;
create role anon;
create role authenticated;
create role service_role;

create function auth.uid() returns uuid language sql stable
  as 'select nullif(current_setting(''app.test_actor'',true),'''')::uuid';
create function app_private.require_project_permission(uuid,text)
returns uuid language plpgsql as $mock$
begin
  if current_setting('app.test_deny',true)='yes' then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  return auth.uid();
end
$mock$;
create table public.projects(id uuid primary key,slug text,owner_id uuid);
create table public.jobs(id uuid primary key,status text);
insert into public.projects values
('11111111-1111-4111-8111-111111111111','tuktuk-control','22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333','another-project','22222222-2222-4222-8222-222222222222');
insert into public.jobs values('44444444-4444-4444-8444-444444444444','accepted');

\i /repo/supabase/migrations/20261117163000_tuktuk_customer_campaign_draft_catalog.sql

do $check$
declare
  p uuid:='11111111-1111-4111-8111-111111111111';
  draft_id uuid;
  x app_private.marketplace_customer_campaign_drafts%rowtype;
  n integer;
begin
  perform set_config('app.test_actor','22222222-2222-4222-8222-222222222222',true);
  draft_id:=public.admin_save_marketplace_customer_campaign_draft_v1(
    p,null,'tuktuk_bienvenida','Bienvenida TukTuk','Primera solicitud',
    'percent',10,500,'new',current_date,current_date+7,50,15000);
  if draft_id is null then raise exception 'Fixture: no draft created'; end if;
  select * into x from public.admin_list_marketplace_customer_campaign_drafts_v1(p);
  if x.id<>draft_id or x.status<>'draft' or x.benefit_value<>10 or x.max_uses<>50 then
    raise exception 'Fixture: draft not persisted %',to_jsonb(x);
  end if;
  select count(*) into n from app_private.marketplace_customer_campaign_draft_history;
  if n<>1 then raise exception 'Fixture: creation audit absent %',n; end if;
  perform public.admin_save_marketplace_customer_campaign_draft_v1(
    p,draft_id,'tuktuk_bienvenida','Bienvenida ampliada','','fixed',300,null,'all',
    current_date+1,current_date+8,40,12000);
  select * into x from app_private.marketplace_customer_campaign_drafts where id=draft_id;
  if x.benefit_kind<>'fixed' or x.status<>'draft' or x.benefit_value<>300 then
    raise exception 'Fixture: edited draft incorrect';
  end if;
  if (select count(*) from app_private.marketplace_customer_campaign_draft_history)<>2 then
    raise exception 'Fixture: edit audit missing';
  end if;

  begin
    perform public.admin_save_marketplace_customer_campaign_draft_v1(
      p,null,'tuktuk_bienvenida','Repetido','','percent',10,100,'new',
      current_date,current_date+4,10,200);
    raise exception 'Fixture: duplicate code accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.admin_save_marketplace_customer_campaign_draft_v1(
      p,null,'tuktuk_riesgo','Descuento peligroso','','percent',90,100,'new',
      current_date,current_date+4,10,200);
    raise exception 'Fixture: unsafe discount accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_save_marketplace_customer_campaign_draft_v1(
      p,null,'tuktuk_fechas','Vigencia mala','','fixed',300,null,'new',
      current_date+7,current_date,10,200);
    raise exception 'Fixture: invalid dates accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_save_marketplace_customer_campaign_draft_v1(
      p,draft_id,'tuktuk_otro','Código alterado','','fixed',300,null,'new',
      current_date,current_date+7,10,200);
    raise exception 'Fixture: changed attribution code';
  exception when sqlstate '22023' then null;
  end;
  if not public.admin_archive_marketplace_customer_campaign_draft_v1(p,draft_id) then
    raise exception 'Fixture: archive failed';
  end if;
  if not public.admin_archive_marketplace_customer_campaign_draft_v1(p,draft_id) then
    raise exception 'Fixture: idempotent archive failed';
  end if;
  if (select count(*) from app_private.marketplace_customer_campaign_draft_history)<>3 then
    raise exception 'Fixture: archive duplicate event';
  end if;
  begin
    perform public.admin_save_marketplace_customer_campaign_draft_v1(
      p,draft_id,'tuktuk_bienvenida','Archivado editado','','fixed',300,null,'new',
      current_date,current_date+7,10,200);
    raise exception 'Fixture: edited archived draft';
  exception when sqlstate '22023' then null;
  end;

  if has_table_privilege('anon','app_private.marketplace_customer_campaign_drafts','select')
     or has_table_privilege('authenticated','app_private.marketplace_customer_campaign_drafts','insert')
     or has_function_privilege('anon','public.admin_list_marketplace_customer_campaign_drafts_v1(uuid)','execute')
     or has_function_privilege('anon',
       'public.admin_save_marketplace_customer_campaign_draft_v1(uuid,uuid,text,text,text,text,numeric,numeric,text,date,date,integer,numeric)','execute')
  then raise exception 'Fixture: anonymous/direct access';
  end if;
  if (select status from public.jobs limit 1)<>'accepted' then
    raise exception 'Fixture: existing service changed';
  end if;
  perform set_config('app.test_actor','55555555-5555-4555-8555-555555555555',true);
  begin
    perform public.admin_save_marketplace_customer_campaign_draft_v1(
      p,null,'tuktuk_external','Otro usuario','','fixed',100,null,'new',
      current_date,current_date+7,10,200);
    raise exception 'Fixture: nonowner may change offers';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('app.test_deny','yes',true);
  begin
    perform public.admin_list_marketplace_customer_campaign_drafts_v1(p);
    raise exception 'Fixture: denied user may list';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'TUKTUK_CUSTOMER_CAMPAIGN_DRAFTS_FIXTURE_OK';
end
$check$;
