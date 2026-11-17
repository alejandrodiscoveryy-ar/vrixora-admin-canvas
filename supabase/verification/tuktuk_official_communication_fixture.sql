-- PostgreSQL 17 disposable fixture. Never run against TukTuk production.
CREATE SCHEMA app_private;
CREATE SCHEMA auth;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  'select nullif(current_setting(''app.test_actor'',true),'''')::uuid';
CREATE FUNCTION app_private.require_project_permission(uuid,text)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('app.test_deny',true)='yes' THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 RETURN '11111111-1111-4111-8111-111111111111'::uuid;
END $$;
CREATE TABLE public.projects(id uuid PRIMARY KEY,slug text);
CREATE TABLE public.driver_profiles(project_id uuid,user_id uuid,status text,
  activated_at timestamptz,suspended_at timestamptz);
CREATE TABLE app_private.marketplace_driver_promo_profiles(
  project_id uuid,driver_user_id uuid,code text,public_name text,
  revoked_at timestamptz,consented_at timestamptz);
CREATE TABLE app_private.marketplace_driver_promo_attribution(
  project_id uuid,driver_user_id uuid,job_id uuid,created_at timestamptz);
CREATE TABLE public.jobs(id uuid,project_id uuid,is_test boolean,status text);
INSERT INTO public.projects VALUES('11111111-1111-4111-8111-111111111111','tuktuk-control');
INSERT INTO public.driver_profiles VALUES
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','active',now()-interval '30 days',null);
INSERT INTO app_private.marketplace_driver_promo_profiles VALUES
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','0123456789abcdef0123456789abcdef','Demo Impulsa',null,now()-interval '5 days');
INSERT INTO public.jobs VALUES
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',false,'settled'),
('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',true,'settled');
INSERT INTO app_private.marketplace_driver_promo_attribution VALUES
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',now()-interval '1 hour'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555',now()-interval '1 hour');
\i /repo/supabase/migrations/20261116230000_impulsa_communication_analytics.sql
\i /repo/supabase/migrations/20261117090000_tuktuk_official_communication_campaign.sql

DO $$
DECLARE
 pid uuid:='11111111-1111-4111-8111-111111111111';
 sid uuid:='33333333-3333-4333-8333-333333333333';
 code text:='0123456789abcdef0123456789abcdef';
 d jsonb; p jsonb;
BEGIN
 PERFORM set_config('app.test_actor','22222222-2222-4222-8222-222222222222',true);
 IF NOT public.record_my_marketplace_impulsa_share_action_v1('share_attempt','whatsapp_groups','centro') THEN
   RAISE EXCEPTION 'missing share action';
 END IF;
 IF NOT public.record_public_marketplace_impulsa_event_v1('link_open',sid,code,'whatsapp_groups','centro') THEN
   RAISE EXCEPTION 'missing link open';
 END IF;
 PERFORM public.record_public_marketplace_impulsa_event_v1('link_open',sid,code,'whatsapp_groups','centro');
 PERFORM public.record_public_marketplace_impulsa_event_v1('app_open',sid,code,'whatsapp_groups','centro');
 PERFORM public.record_public_marketplace_impulsa_event_v1('origin_selected',sid,code,'whatsapp_groups','centro');
 PERFORM public.record_public_marketplace_impulsa_event_v1('destination_selected',sid,code,'whatsapp_groups','centro');
 PERFORM public.record_public_marketplace_impulsa_event_v1('quote_ready',sid,code,'whatsapp_groups','centro',null,3900);
 PERFORM public.record_public_marketplace_impulsa_event_v1('request_started',sid,code,'whatsapp_groups','centro');
 PERFORM public.record_public_marketplace_impulsa_event_v1('survey_answer',sid,code,'whatsapp_groups','centro','price');
 PERFORM public.record_public_marketplace_impulsa_event_v1('request_created',sid,code,'whatsapp_groups','centro');
 -- Anonymous/direct session remains measurable but never inflates Impulsa.
 PERFORM public.record_public_marketplace_impulsa_event_v1(
   'app_open','66666666-6666-4666-8666-666666666666'::uuid,null,'direct');
 PERFORM public.record_public_marketplace_impulsa_event_v1(
   'quote_ready','66666666-6666-4666-8666-666666666666'::uuid,null,'direct',null,null,1100);

 IF public.record_public_marketplace_impulsa_event_v1('link_open',sid,'invalid','facebook',null) THEN
   RAISE EXCEPTION 'accepted spoofed profile';
 END IF;
 IF public.record_public_marketplace_impulsa_event_v1('survey_answer',sid,code,'facebook',null,'personal_phone') THEN
   RAISE EXCEPTION 'accepted unapproved survey data';
 END IF;
 d:=public.admin_get_marketplace_impulsa_communications_v1(pid,30);
 IF (d->'organic_totals'->>'app_opens')::int<>1 OR
    (d->'organic_totals'->>'quotes')::int<>1 THEN
    RAISE EXCEPTION 'organic figures missing or mixed into Impulsa %',d->'organic_totals';
 END IF;
 IF (d->'totals'->>'shares')::int<>1
   OR (d->'totals'->>'clicks')::int<>1
   OR (d->'totals'->>'sessions')::int<>1
   OR (d->'totals'->>'quotes')::int<>1
   OR (d->'totals'->>'requests_created')::int<>1 THEN
    RAISE EXCEPTION 'totals or dedupe wrong %',d->'totals';
 END IF;
 p:=d->'drivers'->0;
 IF (p->>'completed_real')::int<>1 OR (p->>'attributed_real')::int<>1 THEN
   RAISE EXCEPTION 'test job leaked into real conversion count %',p;
 END IF;
 IF (d->'channels'->0->>'campaign')<>'centro'
   OR jsonb_array_length(d->'price_segments')<>1 THEN
   RAISE EXCEPTION 'channel campaign or price band missing';
 END IF;
 IF has_table_privilege('anon','app_private.marketplace_impulsa_communication_events','SELECT') OR
  has_function_privilege('anon','public.record_public_marketplace_impulsa_event_v1(text,uuid,text,text,text,text,numeric)','EXECUTE') THEN
   RAISE EXCEPTION 'anonymous access to private logs';
 END IF;
 IF NOT has_function_privilege('service_role','public.record_public_marketplace_impulsa_event_v1(text,uuid,text,text,text,text,numeric)','EXECUTE') THEN
  RAISE EXCEPTION 'server role cannot ingest';
 END IF;
 IF NOT has_function_privilege('authenticated','public.record_my_marketplace_impulsa_share_action_v1(text,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'driver share action not exposed to authenticated';
 END IF;
 BEGIN
  PERFORM public.admin_get_marketplace_impulsa_communications_v1(pid,31);
  RAISE EXCEPTION 'invalid day range allowed';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 PERFORM set_config('app.test_deny','yes',true);
 BEGIN
  PERFORM public.admin_get_marketplace_impulsa_communications_v1(pid,30);
  RAISE EXCEPTION 'denied user received admin report';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 RAISE NOTICE 'IMPULSA_COMMUNICATION_FIXTURE_OK';
END $$;


-- The official campaign is a separate source. This block runs after all
-- original Impulsa fixture assertions, so retro-compatibility is tested too.
DO $$
DECLARE
  pid uuid:='11111111-1111-4111-8111-111111111111';
  sid uuid:='77777777-7777-4777-8777-777777777777';
  sid_bad uuid:='88888888-8888-4888-8888-888888888888';
  code text:='0123456789abcdef0123456789abcdef';
  official jsonb;
  personal jsonb;
  p jsonb;
BEGIN
  PERFORM set_config('app.test_actor','22222222-2222-4222-8222-222222222222',true);
  IF NOT public.admin_record_marketplace_tuktuk_share_action_v1(
    pid,'link_copied','whatsapp_groups','tuktuk_hospitales') THEN
    RAISE EXCEPTION 'Official copy not registered';
  END IF;
  IF NOT public.admin_record_marketplace_tuktuk_share_action_v1(
    pid,'share_attempt','whatsapp_groups','tuktuk_hospitales') THEN
    RAISE EXCEPTION 'Official share not registered';
  END IF;
  IF NOT public.record_public_marketplace_impulsa_event_v1(
    'link_open',sid,null,'whatsapp_groups','tuktuk_hospitales') THEN
    RAISE EXCEPTION 'Official tagged click not accepted';
  END IF;
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'link_open',sid,null,'whatsapp_groups','tuktuk_hospitales');
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'app_open',sid,null,'whatsapp_groups','tuktuk_hospitales');
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'origin_selected',sid,null,'whatsapp_groups','tuktuk_hospitales');
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'destination_selected',sid,null,'whatsapp_groups','tuktuk_hospitales');
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'quote_ready',sid,null,'whatsapp_groups','tuktuk_hospitales',null,3500);
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'request_started',sid,null,'whatsapp_groups','tuktuk_hospitales');
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'request_created',sid,null,'whatsapp_groups','tuktuk_hospitales');
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'survey_answer',sid,null,'whatsapp_groups','tuktuk_hospitales','comparing');

  -- Another explicit official action from QR with the same session UUID
  -- is a separate campaign attribution, not an unknown organic visit.
  PERFORM public.record_public_marketplace_impulsa_event_v1(
    'link_open',sid,null,'qr','tuktuk_pegatinas');

  IF public.record_public_marketplace_impulsa_event_v1(
    'link_open',sid_bad,null,'direct',null) THEN
    RAISE EXCEPTION 'Untagged direct visit falsely counted as official';
  END IF;
  IF public.record_public_marketplace_impulsa_event_v1(
    'link_open',sid_bad,'bad-profile','direct','tuktuk') THEN
    RAISE EXCEPTION 'Invalid driver code accepted as official';
  END IF;
  BEGIN
    PERFORM public.admin_record_marketplace_tuktuk_share_action_v1(
      pid,'share_attempt','facebook','other_brand');
    RAISE EXCEPTION 'Non-TukTuk campaign accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  official:=public.admin_get_marketplace_tuktuk_communications_v1(pid,30);
  IF (official->'totals'->>'link_opens')::int<>2 OR
     (official->'totals'->>'visitor_sessions')::int<>1 OR
     (official->'totals'->>'app_opens')::int<>1 OR
     (official->'totals'->>'quotes')::int<>1 OR
     (official->'totals'->>'requests_created')::int<>1 OR
     (official->'totals'->>'share_attempts')::int<>1 OR
     (official->'totals'->>'copies')::int<>1 THEN
    RAISE EXCEPTION 'Official report counts / dedupe wrong %',official->'totals';
  END IF;
  IF jsonb_array_length(official->'channels')<>2 OR
     jsonb_array_length(official->'campaigns')<>2 OR
     jsonb_array_length(official->'reasons')<>1 OR
     jsonb_array_length(official->'price_segments')<>1 THEN
    RAISE EXCEPTION 'Official campaign segmentation or abandonment missing %',official;
  END IF;

  personal:=public.admin_get_marketplace_impulsa_communications_v1(pid,30);
  IF (personal->'totals'->>'clicks')::int<>1 OR
     (personal->'organic_totals'->>'app_opens')::int<>1 OR
     (personal->'organic_totals'->>'quotes')::int<>1 THEN
    RAISE EXCEPTION 'Official source leaked into Impulsa or organic %',personal;
  END IF;
  p:=personal->'drivers'->0;
  IF (p->>'completed_real')::int<>1 THEN
    RAISE EXCEPTION 'Official clicks modified real driver conversion %',p;
  END IF;
  IF has_function_privilege('anon','public.admin_record_marketplace_tuktuk_share_action_v1(uuid,text,text,text)','EXECUTE')
     OR has_function_privilege('anon','public.admin_get_marketplace_tuktuk_communications_v1(uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous received official Admin access';
  END IF;
  BEGIN
    PERFORM public.admin_get_marketplace_tuktuk_communications_v1(pid,31);
    RAISE EXCEPTION 'Invalid period allowed';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  PERFORM set_config('app.test_deny','yes',true);
  BEGIN
    PERFORM public.admin_record_marketplace_tuktuk_share_action_v1(
      pid,'link_copied','direct','tuktuk');
    RAISE EXCEPTION 'Unauthorized share action recorded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_get_marketplace_tuktuk_communications_v1(pid,30);
    RAISE EXCEPTION 'Unauthorized report returned';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'TUKTUK_OFFICIAL_CAMPAIGN_FIXTURE_OK';
END $$;
