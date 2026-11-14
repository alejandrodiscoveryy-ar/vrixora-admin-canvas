\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. No network calls, secrets, or real customers.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA app_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.projects(id uuid PRIMARY KEY,slug text);
CREATE TABLE public.driver_profiles(project_id uuid,user_id uuid,status text,activated_at timestamptz,suspended_at timestamptz,photo_asset_id uuid,PRIMARY KEY(project_id,user_id));
CREATE TABLE public.driver_vehicle_assignments(project_id uuid,driver_user_id uuid,vehicle_id text,is_active boolean,is_available boolean,accepting_jobs boolean);
CREATE TABLE public.vehicles(project_id uuid,id text,category_code text,marketplace_status text,deleted_at timestamptz);
CREATE TABLE public.vehicle_services(project_id uuid,vehicle_id text,service_code text,enabled boolean);
CREATE TABLE public.media_assets(id uuid,project_id uuid,owner_user_id uuid,asset_kind text,status text,storage_bucket text);
CREATE TABLE public.service_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,service_code text,vehicle_category_code text,scheduled_for timestamptz,details jsonb);
CREATE TABLE public.jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,service_request_id uuid,service_code text,status text,is_test boolean DEFAULT false,test_deleted_at timestamptz,published_at timestamptz,created_at timestamptz DEFAULT now(),expires_at timestamptz,pricing_vehicle_category_code text,assigned_driver_user_id uuid,final_price numeric DEFAULT 100,commission_rate_snapshot numeric DEFAULT 0.1);
CREATE TABLE public.marketplace_customer_request_operations(project_id uuid,customer_id uuid,idempotency_key uuid,job_id uuid,PRIMARY KEY(project_id,customer_id,idempotency_key));
CREATE TABLE public.project_marketplace_dispatch_settings(project_id uuid PRIMARY KEY,enabled boolean,radius_search_enabled boolean,radius_1_enabled boolean,radius_1_km numeric,radius_2_enabled boolean,radius_2_km numeric,radius_3_enabled boolean,radius_3_km numeric,expansion_enabled boolean,expansion_seconds integer,rating_priority_enabled boolean,preferred_min_rating_enabled boolean,preferred_min_rating numeric,minimum_rating_count_enabled boolean,minimum_rating_count integer,allow_below_preferred boolean,allow_outside_max_radius boolean,apply_to_test_jobs boolean,tie_breaker text);
CREATE TABLE public.marketplace_driver_locations(project_id uuid,driver_user_id uuid,vehicle_id text,latitude numeric,longitude numeric,captured_at timestamptz);
CREATE TABLE public.marketplace_customer_ratings(id uuid,project_id uuid,driver_user_id uuid,job_id uuid,stars integer);
CREATE TABLE public.project_marketplace_financial_settings(project_id uuid,commission_enabled boolean);
CREATE TABLE fixture_offers(job_id uuid,driver_user_id uuid,PRIMARY KEY(job_id,driver_user_id));
CREATE FUNCTION public.list_marketplace_published_modalities(text) RETURNS TABLE(service_code text,vehicle_category_code text) LANGUAGE sql STABLE AS $$ VALUES ('passenger'::text,'tricycle'::text),('courier','tricycle'),('passenger','light_car') $$;
CREATE FUNCTION app_private.resolve_marketplace_customer_session(uuid,text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN IF $2 IS DISTINCT FROM 'valid' THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF; RETURN $1; END $$;
CREATE FUNCTION app_private.marketplace_haversine_km(numeric,numeric,numeric,numeric) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT 1::numeric $$;
CREATE FUNCTION app_private.has_active_marketplace_work_trial(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION app_private.marketplace_wallet_available_balance(uuid,uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT 10000::numeric $$;
CREATE FUNCTION app_private.marketplace_driver_can_receive_job(uuid,uuid,text,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM public.jobs j JOIN public.driver_vehicle_assignments a ON a.project_id=j.project_id
 JOIN public.driver_profiles d ON d.project_id=a.project_id AND d.user_id=a.driver_user_id
 JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
 WHERE j.project_id=$1 AND j.id=$4 AND j.status='published' AND a.driver_user_id=$2 AND a.vehicle_id=$3 AND a.is_active AND a.is_available AND a.accepting_jobs AND d.status='active' AND v.marketplace_status='active')
$$;
-- Stub the existing booking RPC with its exact interface. It emulates request idempotency;
-- pricing, routing and session production behavior are NOT certified by this fixture.
CREATE FUNCTION public.create_marketplace_customer_request_v2(
 target_session_id uuid,target_session_token text,target_service_code text,target_origin_text text,target_destination_text text,target_scheduled_for timestamptz,
 target_passenger_count integer,target_cargo_weight_kg numeric,target_cargo_volume_m3 numeric,target_cargo_length_cm numeric,target_cargo_width_cm numeric,target_cargo_height_cm numeric,
 target_required_body_type text,target_notes text,target_details jsonb,target_vehicle_category_code text,target_idempotency_key uuid)
RETURNS TABLE(job_id uuid,service_request_id uuid,status text,recommended_price numeric,minimum_price numeric,low_price_warning_threshold numeric,currency text,pricing_version text,pricing_breakdown jsonb,server_time timestamptz)
LANGUAGE plpgsql AS $$
DECLARE pid uuid; cid uuid; jid uuid; rid uuid;
BEGIN
 cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token);
 SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
 SELECT o.job_id INTO jid FROM public.marketplace_customer_request_operations o WHERE o.project_id=pid AND o.customer_id=cid AND o.idempotency_key=target_idempotency_key;
 IF jid IS NULL THEN
   INSERT INTO public.service_requests(project_id,service_code,vehicle_category_code,scheduled_for,details)
   VALUES(pid,target_service_code,target_vehicle_category_code,target_scheduled_for,target_details) RETURNING id INTO rid;
   INSERT INTO public.jobs(project_id,service_request_id,service_code,status,pricing_vehicle_category_code)
   VALUES(pid,rid,target_service_code,'requested',target_vehicle_category_code) RETURNING id INTO jid;
   INSERT INTO public.marketplace_customer_request_operations VALUES(pid,cid,target_idempotency_key,jid);
 ELSE SELECT j.service_request_id INTO rid FROM public.jobs j WHERE j.id=jid; END IF;
 RETURN QUERY SELECT jid,rid,'requested'::text,100::numeric,100::numeric,100::numeric,'CUP'::text,'fixture'::text,'{}'::jsonb,now();
END $$;
\i docs/security/mi-tuktuk-profiles-candidate.sql
\i docs/security/mi-tuktuk-dispatch-candidate.sql
CREATE FUNCTION app_private.enqueue_marketplace_job_offer_wave(target_job_id uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 INSERT INTO public.fixture_offers SELECT j.id,a.driver_user_id FROM public.jobs j JOIN public.driver_vehicle_assignments a ON a.project_id=j.project_id
 CROSS JOIN LATERAL app_private.marketplace_dispatch_candidate_state(j.project_id,a.driver_user_id,a.vehicle_id,j.id) b
 WHERE j.id=target_job_id AND b.allowed AND app_private.marketplace_driver_can_receive_job(j.project_id,a.driver_user_id,a.vehicle_id,j.id) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
CREATE FUNCTION app_private.fixture_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='requested' AND NEW.status='published' THEN PERFORM app_private.enqueue_marketplace_job_offer_wave(NEW.id); END IF; RETURN NEW; END $$;
CREATE TRIGGER marketplace_enqueue_job_offers AFTER UPDATE OF status ON public.jobs FOR EACH ROW EXECUTE FUNCTION app_private.fixture_publish();
CREATE FUNCTION app_private.fixture_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='published' AND NEW.status='accepted' AND NOT EXISTS(SELECT 1 FROM public.driver_vehicle_assignments a CROSS JOIN LATERAL app_private.marketplace_dispatch_candidate_state(NEW.project_id,NEW.assigned_driver_user_id,a.vehicle_id,NEW.id) b WHERE a.driver_user_id=NEW.assigned_driver_user_id AND a.project_id=NEW.project_id AND b.allowed)
 THEN RAISE EXCEPTION 'JOB_NOT_AVAILABLE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fixture_acceptance BEFORE UPDATE OF status ON public.jobs FOR EACH ROW EXECUTE FUNCTION app_private.fixture_acceptance();
INSERT INTO public.projects VALUES('10000000-0000-0000-0000-000000000001','tuktuk-control');
INSERT INTO public.driver_profiles VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','active',now(),NULL,'50000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','active',now(),NULL,NULL);
INSERT INTO public.vehicles VALUES('10000000-0000-0000-0000-000000000001','v1','tricycle','active',NULL),('10000000-0000-0000-0000-000000000001','v2','tricycle','active',NULL);
INSERT INTO public.driver_vehicle_assignments VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','v1',true,true,true),('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','v2',true,true,true);
INSERT INTO public.vehicle_services VALUES('10000000-0000-0000-0000-000000000001','v1','passenger',true),('10000000-0000-0000-0000-000000000001','v2','passenger',true);
INSERT INTO public.media_assets VALUES('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','driver_photo','available','marketplace-media');
INSERT INTO public.project_marketplace_financial_settings VALUES('10000000-0000-0000-0000-000000000001',false);
INSERT INTO public.project_marketplace_dispatch_settings(project_id,enabled,radius_search_enabled,rating_priority_enabled,preferred_min_rating,tie_breaker)
VALUES('10000000-0000-0000-0000-000000000001',true,false,false,4,'rating_then_distance');
INSERT INTO public.marketplace_driver_locations VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','v1',23,-82,now());
INSERT INTO app_private.marketplace_driver_promo_settings(project_id) VALUES('10000000-0000-0000-0000-000000000001');
DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; driver uuid:='20000000-0000-0000-0000-000000000001'; other uuid:='20000000-0000-0000-0000-000000000002'; customer uuid:='30000000-0000-0000-0000-000000000001'; code text; result jsonb; jid uuid; repeated uuid; jid2 uuid; jid3 uuid; req_key uuid:=gen_random_uuid();
BEGIN
 IF has_table_privilege('authenticated','app_private.marketplace_driver_promo_profiles','SELECT') OR has_function_privilege('anon','public.set_my_marketplace_promo_profile(text,boolean,boolean)','EXECUTE') OR has_function_privilege('authenticated','public.resolve_marketplace_promo_profile_v1(text)','EXECUTE') OR NOT has_function_privilege('service_role','public.resolve_marketplace_promo_profile_v1(text)','EXECUTE') THEN RAISE EXCEPTION 'bad grants'; END IF;
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 BEGIN PERFORM public.set_my_marketplace_promo_profile('Driver',true,true); RAISE EXCEPTION 'feature unexpectedly enabled'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE app_private.marketplace_driver_promo_settings SET profiles_enabled=true,priority_enabled=true WHERE project_id=pid;
 result:=public.set_my_marketplace_promo_profile('Driver',true,true); code:=result->>'code';
 IF code !~ '^[0-9a-f]{32}$' OR NOT (result->>'photo_authorized')::boolean THEN RAISE EXCEPTION 'consent failed'; END IF;
 result:=public.resolve_marketplace_promo_profile_v1(code);
 IF result->>'category_code'<>'tricycle' OR result->>'public_name'<>'Driver' OR result->'service_codes'<>'["passenger"]'::jsonb OR result->>'photo_asset_id' IS NULL THEN RAISE EXCEPTION 'profile mismatch'; END IF;
 IF result ? 'driver_user_id' OR result ? 'project_id' OR result ? 'phone' THEN RAISE EXCEPTION 'private fields exposed'; END IF;
 IF public.resolve_marketplace_promo_profile_v1('invalid') IS NOT NULL THEN RAISE EXCEPTION 'invalid link'; END IF;
 SELECT x.job_id INTO jid FROM public.create_marketplace_customer_request_promo_v1(customer,'valid','passenger','A','B',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','tricycle',req_key,code) x;
 SELECT x.job_id INTO repeated FROM public.create_marketplace_customer_request_promo_v1(customer,'valid','passenger','A','B',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','tricycle',req_key,code) x;
 IF jid IS DISTINCT FROM repeated OR (SELECT count(*) FROM app_private.marketplace_driver_promo_attribution WHERE job_id=jid)<>1 THEN RAISE EXCEPTION 'idempotency failed'; END IF;
 UPDATE public.jobs SET status='published',published_at=now() WHERE id=jid;
 IF (SELECT phase FROM app_private.marketplace_driver_promo_attribution WHERE job_id=jid)<>'preferred' OR (SELECT count(*) FROM fixture_offers WHERE job_id=jid)<>1 OR NOT EXISTS(SELECT 1 FROM fixture_offers WHERE job_id=jid AND driver_user_id=driver) THEN RAISE EXCEPTION 'preferred offer failed'; END IF;
 BEGIN UPDATE public.jobs SET status='accepted',assigned_driver_user_id=other WHERE id=jid; RAISE EXCEPTION 'other driver accepted priority job'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'JOB_NOT_AVAILABLE' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',other::text,true);
 IF public.decline_my_marketplace_promo_offer(jid) THEN RAISE EXCEPTION 'wrong actor decline'; END IF;
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 IF NOT public.decline_my_marketplace_promo_offer(jid) OR public.decline_my_marketplace_promo_offer(jid) THEN RAISE EXCEPTION 'decline not idempotent'; END IF;
 IF (SELECT count(*) FROM fixture_offers WHERE job_id=jid)<>2 THEN RAISE EXCEPTION 'fleet fallback failed'; END IF;
 UPDATE public.jobs SET status='accepted',assigned_driver_user_id=other WHERE id=jid;
 SELECT x.job_id INTO jid2 FROM public.create_marketplace_customer_request_promo_v1(customer,'valid','passenger','A','B',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','tricycle',gen_random_uuid(),code) x;
 UPDATE public.jobs SET status='published',published_at=now() WHERE id=jid2;
 UPDATE app_private.marketplace_driver_promo_attribution SET priority_until=now()-interval '1 second' WHERE job_id=jid2;
 IF app_private.marketplace_promo_release_due()<>1 THEN RAISE EXCEPTION 'timeout release count failed'; END IF;
 IF app_private.marketplace_promo_release_due()<>0 THEN RAISE EXCEPTION 'timeout repeated release'; END IF;
 IF (SELECT count(*) FROM fixture_offers WHERE job_id=jid2)<>2 THEN RAISE EXCEPTION 'timeout offer count failed'; END IF;
 UPDATE public.driver_vehicle_assignments SET accepting_jobs=false WHERE driver_user_id=driver;
 SELECT x.job_id INTO jid3 FROM public.create_marketplace_customer_request_promo_v1(customer,'valid','passenger','A','B',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','tricycle',gen_random_uuid(),code) x;
 UPDATE public.jobs SET status='published',published_at=now() WHERE id=jid3;
 IF (SELECT phase FROM app_private.marketplace_driver_promo_attribution WHERE job_id=jid3)<>'fleet' OR NOT EXISTS(SELECT 1 FROM fixture_offers WHERE job_id=jid3 AND driver_user_id=other) THEN RAISE EXCEPTION 'resting driver fallback failed'; END IF;
 -- Normal rides, incompatible categories, scheduled services and disabled priority remain fleet jobs.
 SELECT x.job_id INTO jid3 FROM public.create_marketplace_customer_request_promo_v1(customer,'valid','passenger','A','B',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','light_car',gen_random_uuid(),code) x;
 IF EXISTS(SELECT 1 FROM app_private.marketplace_driver_promo_attribution WHERE job_id=jid3) THEN RAISE EXCEPTION 'incompatible category attributed'; END IF;
 SELECT x.job_id INTO jid3 FROM public.create_marketplace_customer_request_promo_v1(customer,'valid','passenger','A','B',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','tricycle',gen_random_uuid(),'invalid') x;
 IF EXISTS(SELECT 1 FROM app_private.marketplace_driver_promo_attribution WHERE job_id=jid3) THEN RAISE EXCEPTION 'invalid link attributed'; END IF;
 UPDATE public.driver_vehicle_assignments SET accepting_jobs=true WHERE driver_user_id=driver;
 UPDATE public.jobs SET status='published',published_at=now() WHERE id=jid3;
 IF (SELECT count(*) FROM fixture_offers WHERE job_id=jid3)<>2 THEN RAISE EXCEPTION 'ordinary ride changed'; END IF;
 SELECT x.job_id INTO jid3 FROM public.create_marketplace_customer_request_promo_v1(customer,'valid','passenger','A','B',now()+interval '1 hour',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','tricycle',gen_random_uuid(),code) x;
 UPDATE public.jobs SET status='published',published_at=now() WHERE id=jid3;
 IF (SELECT phase FROM app_private.marketplace_driver_promo_attribution WHERE job_id=jid3)<>'fleet' THEN RAISE EXCEPTION 'scheduled priority improperly enabled'; END IF;
 UPDATE app_private.marketplace_driver_promo_settings SET priority_enabled=false WHERE project_id=pid;
 SELECT x.job_id INTO jid3 FROM public.create_marketplace_customer_request_promo_v1(customer,'valid','passenger','A','B',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','tricycle',gen_random_uuid(),code) x;
 UPDATE public.jobs SET status='published',published_at=now() WHERE id=jid3;
 IF (SELECT phase FROM app_private.marketplace_driver_promo_attribution WHERE job_id=jid3)<>'fleet' THEN RAISE EXCEPTION 'flag off priority'; END IF;
 UPDATE app_private.marketplace_driver_promo_settings SET priority_enabled=true WHERE project_id=pid;
 PERFORM public.set_my_marketplace_promo_profile(NULL,false,false);
 IF public.resolve_marketplace_promo_profile_v1(code) IS NOT NULL THEN RAISE EXCEPTION 'revocation failed'; END IF;
 IF public.set_my_marketplace_promo_profile('Driver',true,true)->>'code'=code THEN RAISE EXCEPTION 'revoked code reused'; END IF;
END $$;
SELECT 'Mi TukTuk isolated SQL contract passed' AS result;

-- Extend the isolated fixture with the production fields required by the
-- automatic-card and administrative verification contract.
ALTER TABLE public.driver_profiles
  ADD COLUMN identity_front_asset_id uuid,
  ADD COLUMN identity_back_asset_id uuid,
  ADD COLUMN identity_document_type text;
ALTER TABLE public.media_assets ADD COLUMN storage_path text;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,display_name text);
CREATE TABLE public.audit_events(project_id uuid,actor_id uuid,action text,entity_type text,entity_id text,metadata jsonb);
CREATE FUNCTION app_private.require_project_permission(uuid,text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM '90000000-0000-0000-0000-000000000001'::uuid
    OR $1 IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid
    OR $2 IS DISTINCT FROM 'marketplace.manage' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
END $$;
CREATE FUNCTION app_private.marketplace_onboarding_requirements_complete(uuid,text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
INSERT INTO public.profiles VALUES
 ('20000000-0000-0000-0000-000000000001','Driver'),
 ('20000000-0000-0000-0000-000000000002','Other Driver');
UPDATE public.media_assets SET storage_path='driver-one/photo.png'
  WHERE id='50000000-0000-0000-0000-000000000001';
INSERT INTO public.media_assets(id,project_id,owner_user_id,asset_kind,status,storage_bucket,storage_path) VALUES
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','driver_photo','available','marketplace-media','driver-two/photo.png'),
 ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','identity_front','available','marketplace-identity','driver-two/front.png'),
 ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','identity_back','available','marketplace-identity','driver-two/back.png');
UPDATE public.driver_profiles SET
  photo_asset_id='50000000-0000-0000-0000-000000000002',
  identity_front_asset_id='50000000-0000-0000-0000-000000000003',
  identity_back_asset_id='50000000-0000-0000-0000-000000000004',
  identity_document_type='national_id'
  WHERE user_id='20000000-0000-0000-0000-000000000002';
\i docs/security/mi-tuktuk-automatic-card-identity-review-candidate.sql
DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001';
  driver uuid:='20000000-0000-0000-0000-000000000001';
  other uuid:='20000000-0000-0000-0000-000000000002';
  admin uuid:='90000000-0000-0000-0000-000000000001';
  front uuid:='50000000-0000-0000-0000-000000000003';
  back uuid:='50000000-0000-0000-0000-000000000004';
  prepared jsonb; result jsonb; code text; old_code text; existing_code text;
BEGIN
  IF has_table_privilege('authenticated','app_private.marketplace_driver_identity_reviews','SELECT')
    OR has_function_privilege('anon','public.prepare_my_marketplace_promo_card_v1()','EXECUTE')
    OR has_function_privilege('anon','public.admin_activate_marketplace_promo_card_v1(uuid,uuid,boolean,text)','EXECUTE')
    OR has_function_privilege('anon','public.admin_set_marketplace_driver_identity_review_v1(uuid,uuid,boolean,text,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','app_private.marketplace_driver_identity_verified_v1(uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'bad grants'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN PERFORM public.prepare_my_marketplace_promo_card_v1();
    RAISE EXCEPTION 'anonymous private card'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',driver::text,true);
  SELECT p.code INTO existing_code FROM app_private.marketplace_driver_promo_profiles p WHERE p.project_id=pid AND p.driver_user_id=driver;
  prepared:=public.prepare_my_marketplace_promo_card_v1();
  IF prepared->>'code' IS DISTINCT FROM existing_code OR prepared->>'enabled' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'existing active link changed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other::text,true);
  IF public.prepare_my_marketplace_promo_card_v1()->>'enabled' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'unapproved card available'; END IF;
  BEGIN PERFORM public.set_my_marketplace_promo_profile('Other Driver',true,true);
    RAISE EXCEPTION 'legacy self activation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.admin_activate_marketplace_promo_card_v1(pid,other,true,'Registration record');
    RAISE EXCEPTION 'self activation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.admin_set_marketplace_driver_identity_review_v1(pid,other,true,'Self approval forbidden',front,back);
    RAISE EXCEPTION 'self verification allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  BEGIN PERFORM public.admin_activate_marketplace_promo_card_v1(pid,other,true,'Registration record');
    RAISE EXCEPTION 'unverified activation allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.admin_set_marketplace_driver_identity_review_v1(pid,other,true,'Wrong document',back,front);
    RAISE EXCEPTION 'stale review accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  result:=public.admin_set_marketplace_driver_identity_review_v1(pid,other,true,'Both sides reviewed',front,back);
  IF result->>'verified' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'admin review failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other::text,true);
  IF public.prepare_my_marketplace_promo_card_v1()->>'enabled' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'verification alone published card'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  BEGIN PERFORM public.admin_activate_marketplace_promo_card_v1(pid,other,false,'Registration record');
    RAISE EXCEPTION 'missing authorization accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.driver_profiles SET status='pending_topup' WHERE user_id=other AND project_id=pid;
  BEGIN PERFORM public.admin_activate_marketplace_promo_card_v1(pid,other,true,'Registration record');
    RAISE EXCEPTION 'inactive service published'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.driver_profiles SET status='active' WHERE user_id=other AND project_id=pid;
  result:=public.admin_activate_marketplace_promo_card_v1(pid,other,true,'Registration record');
  code:=result->>'code';
  IF code IS NULL OR code !~ '^[0-9a-f]{32}$' THEN RAISE EXCEPTION 'invalid code'; END IF;
  IF public.admin_activate_marketplace_promo_card_v1(pid,other,true,'Registration record')->>'code' IS DISTINCT FROM code THEN
    RAISE EXCEPTION 'repeated activation changed code'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_events WHERE action='admin_activate_driver_promo' AND actor_id=admin
     AND metadata->>'authorization_reference'='Registration record') THEN RAISE EXCEPTION 'activation audit missing'; END IF;
  IF public.resolve_marketplace_promo_profile_v1(code)->>'public_name' IS DISTINCT FROM 'Other Driver'
    THEN RAISE EXCEPTION 'QR not live immediately after activation'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other::text,true);
  prepared:=public.prepare_my_marketplace_promo_card_v1();
  IF prepared->>'enabled' IS DISTINCT FROM 'true' OR prepared->>'code' IS DISTINCT FROM code
    OR prepared->>'identity_verified' IS DISTINCT FROM 'true' OR prepared->>'photo_path' IS DISTINCT FROM 'driver-two/photo.png'
    THEN RAISE EXCEPTION 'approved card unavailable: %',prepared; END IF;
  IF public.set_my_marketplace_promo_profile('Tampered',true,false)->>'public_name' IS DISTINCT FROM 'Other Driver'
    THEN RAISE EXCEPTION 'legacy client changed reviewed name'; END IF;
  UPDATE public.media_assets SET status='pending' WHERE id=front;
  IF public.prepare_my_marketplace_promo_card_v1()->>'identity_verified' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'missing document retained verification'; END IF;
  UPDATE public.media_assets SET status='available' WHERE id=front;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  PERFORM public.admin_set_marketplace_driver_identity_review_v1(pid,other,false,'Review withdrawn');
  IF public.resolve_marketplace_promo_profile_v1(code) IS NOT NULL THEN RAISE EXCEPTION 'revoked approval still resolves'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other::text,true);
  IF public.prepare_my_marketplace_promo_card_v1()->>'enabled' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'revoked approval still has card'; END IF;
  old_code:=code;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  PERFORM public.admin_set_marketplace_driver_identity_review_v1(pid,other,true,'Both sides reviewed again',front,back);
  code:=public.admin_activate_marketplace_promo_card_v1(pid,other,true,'Registration record')->>'code';
  IF code IS NOT DISTINCT FROM old_code OR public.resolve_marketplace_promo_profile_v1(old_code) IS NOT NULL
    THEN RAISE EXCEPTION 'revoked link reused'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other::text,true);
  PERFORM public.revoke_my_marketplace_promo_card_v1();
  IF public.resolve_marketplace_promo_profile_v1(code) IS NOT NULL THEN RAISE EXCEPTION 'driver opt-out ignored'; END IF;
END $$;
SELECT 'Mi TukTuk administrative activation isolated SQL contract passed' AS result;

-- Historical drivers may have both reviewed images but no recorded type.
\i docs/security/mi-tuktuk-legacy-identity-review-candidate.sql
DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001';
  admin uuid:='90000000-0000-0000-0000-000000000001';
  other uuid:='20000000-0000-0000-0000-000000000002';
  front uuid:='50000000-0000-0000-0000-000000000003';
  back uuid:='50000000-0000-0000-0000-000000000004';
  result jsonb;
BEGIN
  IF has_function_privilege('anon','public.admin_set_marketplace_driver_identity_review_v2(uuid,uuid,boolean,text,uuid,uuid,text)','EXECUTE')
    THEN RAISE EXCEPTION 'anonymous review allowed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  UPDATE public.driver_profiles SET identity_document_type=null WHERE project_id=pid AND user_id=other;
  PERFORM set_config('request.jwt.claim.sub',other::text,true);
  BEGIN PERFORM public.admin_set_marketplace_driver_identity_review_v2(pid,other,true,'Self review forbidden',front,back,'national_id');
    RAISE EXCEPTION 'self review allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  BEGIN PERFORM public.admin_set_marketplace_driver_identity_review_v2(pid,other,true,'Incorrect document',back,front,'national_id');
    RAISE EXCEPTION 'incorrect images accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.admin_set_marketplace_driver_identity_review_v2(pid,other,true,'Missing document type',front,back,null);
    RAISE EXCEPTION 'missing type accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.media_assets SET status='pending' WHERE id=front;
  BEGIN PERFORM public.admin_set_marketplace_driver_identity_review_v2(pid,other,true,'Unavailable document',front,back,'national_id');
    RAISE EXCEPTION 'unavailable document accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT identity_document_type FROM public.driver_profiles WHERE project_id=pid AND user_id=other) IS NOT NULL
    THEN RAISE EXCEPTION 'failed review persisted classification'; END IF;
  UPDATE public.media_assets SET status='available' WHERE id=front;
  result:=public.admin_set_marketplace_driver_identity_review_v2(pid,other,true,'Reviewed original historical documents',front,back,'national_id');
  IF result->>'verified' IS DISTINCT FROM 'true'
    OR (SELECT identity_document_type FROM public.driver_profiles WHERE project_id=pid AND user_id=other) IS DISTINCT FROM 'national_id'
    THEN RAISE EXCEPTION 'legacy review failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_events WHERE action='admin_classify_driver_identity' AND actor_id=admin AND metadata->>'document_type'='national_id')
    THEN RAISE EXCEPTION 'classification audit missing'; END IF;
  BEGIN PERFORM public.admin_set_marketplace_driver_identity_review_v2(pid,other,true,'Attempt to change existing type',front,back,'driver_license');
    RAISE EXCEPTION 'existing type overwritten'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.admin_set_marketplace_driver_identity_review_v2(pid,other,false,'Revoke reviewed identity',null,null,null);
  IF app_private.marketplace_driver_identity_verified_v1(pid,other) THEN RAISE EXCEPTION 'review not revoked'; END IF;
END $$;
SELECT 'Legacy identity review contract passed' AS result;

-- Alias contract against already installed consent and identity gates.
\i docs/security/mi-tuktuk-short-aliases-candidate.sql
DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001';
  admin uuid:='90000000-0000-0000-0000-000000000001';
  other uuid:='20000000-0000-0000-0000-000000000002';
  driver uuid:='20000000-0000-0000-0000-000000000001';
  front uuid:='50000000-0000-0000-0000-000000000003';
  back uuid:='50000000-0000-0000-0000-000000000004';
  code text; old_alias text; next_code text; next_alias text;
BEGIN
  IF has_table_privilege('anon','app_private.marketplace_driver_promo_aliases','SELECT')
    OR has_table_privilege('authenticated','app_private.marketplace_driver_promo_aliases','SELECT')
    OR has_function_privilege('anon','public.my_marketplace_promo_alias_v1(text)','EXECUTE')
    OR has_function_privilege('authenticated','public.resolve_marketplace_promo_alias_v1(text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.resolve_marketplace_promo_alias_v1(text)','EXECUTE')
  THEN RAISE EXCEPTION 'alias grants invalid'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  PERFORM public.admin_set_marketplace_driver_identity_review_v2(pid,other,true,'Both sides reviewed again',front,back,'national_id');
  code:=public.admin_activate_marketplace_promo_card_v1(pid,other,true,'Registration record')->>'code';
  old_alias:=public.admin_marketplace_promo_alias_v1(pid,other);
  IF old_alias IS DISTINCT FROM 'other' OR public.resolve_marketplace_promo_alias_v1(old_alias) IS DISTINCT FROM code
    THEN RAISE EXCEPTION 'automatic alias unavailable'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other::text,true);
  IF public.my_marketplace_promo_alias_v1('viaja-conmigo') IS DISTINCT FROM 'viaja-conmigo' THEN RAISE EXCEPTION 'custom alias update failed'; END IF;
  IF public.resolve_marketplace_promo_alias_v1('viaja-conmigo') IS DISTINCT FROM code
    OR public.resolve_marketplace_promo_alias_v1(old_alias) IS NOT NULL
    OR public.get_marketplace_promo_primary_alias_v1(code) IS DISTINCT FROM 'viaja-conmigo'
    THEN RAISE EXCEPTION 'custom alias or primary alias invalid'; END IF;
  BEGIN PERFORM public.my_marketplace_promo_alias_v1('admin');
    RAISE EXCEPTION 'reserved name accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.admin_marketplace_promo_alias_v1(pid,driver,'stolen');
    RAISE EXCEPTION 'driver impersonated admin'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.revoke_my_marketplace_promo_card_v1();
  IF public.resolve_marketplace_promo_alias_v1(old_alias) IS NOT NULL OR public.resolve_marketplace_promo_alias_v1('viaja-conmigo') IS NOT NULL
    THEN RAISE EXCEPTION 'revoked alias still resolves'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  next_code:=public.admin_activate_marketplace_promo_card_v1(pid,other,true,'New documented consent')->>'code';
  next_alias:=public.admin_marketplace_promo_alias_v1(pid,other);
  IF next_code IS NOT DISTINCT FROM code OR next_alias IS DISTINCT FROM 'other2'
    OR public.resolve_marketplace_promo_alias_v1(old_alias) IS NOT NULL
    OR public.resolve_marketplace_promo_alias_v1(next_alias) IS DISTINCT FROM next_code
    THEN RAISE EXCEPTION 'old alias reused after reactivation'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other::text,true);
  BEGIN PERFORM public.my_marketplace_promo_alias_v1('viaja-conmigo');
    RAISE EXCEPTION 'old alias reassigned'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SELECT 'Mi TukTuk permanent aliases isolated SQL contract passed' AS result;
