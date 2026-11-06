BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
DO $audit$
DECLARE
  pid uuid := 'dfb41cea-a812-46f2-b511-7a60bd3d78af';
  actors uuid[]; actor uuid; sample_number integer := 0;
  checks jsonb := '[]'::jsonb;
  expected_balance numeric; observed_balance numeric; returned_rows bigint;
  own_files uuid[]; foreign_files uuid[]; foreign_jobs uuid[]; own_assets uuid[];
  visible_own bigint; visible_foreign bigint; foreign_job_rows bigint;
  returned_jobs bigint; doc jsonb; docs_owned boolean; scope text;
  denied boolean; error_code text;
BEGIN
  SELECT array_agg(s.user_id) INTO actors FROM (
    SELECT w.user_id FROM public.wallets w
    WHERE w.project_id=pid
      AND NOT EXISTS (SELECT 1 FROM public.project_members m
        WHERE m.project_id=pid AND m.user_id=w.user_id)
    ORDER BY (EXISTS (SELECT 1 FROM public.media_assets a
      JOIN storage.objects o ON o.bucket_id=a.storage_bucket AND o.name=a.storage_path
      WHERE a.owner_user_id=w.user_id AND a.project_id=pid
        AND a.status IN ('pending','available')
        AND a.storage_bucket IN ('marketplace-media','marketplace-identity'))) DESC,
      (SELECT coalesce(sum(t.amount_delta),0) FROM public.wallet_transactions t
        WHERE t.project_id=pid AND t.user_id=w.user_id) DESC, w.user_id
    LIMIT 2
  ) s;
  IF coalesce(cardinality(actors),0)<>2 THEN
    RAISE EXCEPTION 'AUDIT_NEEDS_TWO_NONSTAFF_WALLET_USERS';
  END IF;
  FOREACH actor IN ARRAY actors LOOP
    sample_number := sample_number+1;
    SELECT coalesce(sum(t.amount_delta),0) INTO expected_balance
      FROM public.wallet_transactions t WHERE t.project_id=pid AND t.user_id=actor;
    SELECT array_agg(a.id) INTO own_assets FROM public.media_assets a
      WHERE a.project_id=pid AND a.owner_user_id=actor;
    SELECT array_agg(o.id) FILTER (WHERE a.owner_user_id=actor),
           array_agg(o.id) FILTER (WHERE a.owner_user_id<>actor)
      INTO own_files,foreign_files
      FROM storage.objects o JOIN public.media_assets a
        ON a.storage_bucket=o.bucket_id AND a.storage_path=o.name
      WHERE a.project_id=pid AND a.status IN ('pending','available')
        AND a.storage_bucket IN ('marketplace-media','marketplace-identity');
    SELECT array_agg(j.id) INTO foreign_jobs FROM public.jobs j
      WHERE j.project_id=pid AND j.assigned_driver_user_id IS NOT NULL
        AND j.assigned_driver_user_id<>actor;

    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    PERFORM set_config('request.jwt.claim.sub',actor::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    BEGIN
      SELECT count(*),min(w.total_balance) INTO returned_rows,observed_balance
        FROM public.get_my_marketplace_wallet() w;
      checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
        'check','wallet_matches_own_ledger','pass',returned_rows=1 AND observed_balance=expected_balance));
    EXCEPTION WHEN OTHERS THEN
      checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
        'check','wallet_matches_own_ledger','pass',false,'sqlstate',SQLSTATE));
    END;

    BEGIN
      SELECT count(*) INTO returned_rows FROM public.wallets w WHERE w.user_id<>actor;
      denied:=returned_rows=0;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true;
    END;
    checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
      'check','direct_foreign_wallet_rows_blocked','pass',denied));

    SELECT count(*) INTO visible_own FROM storage.objects WHERE id=ANY(own_files);
    SELECT count(*) INTO visible_foreign FROM storage.objects WHERE id=ANY(foreign_files);
    checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
      'check','storage_own_files_visible','pass',visible_own=coalesce(cardinality(own_files),0),
      'sample_objects',coalesce(cardinality(own_files),0)));
    checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
      'check','storage_foreign_files_hidden','pass',visible_foreign=0,
      'sample_objects',coalesce(cardinality(foreign_files),0)));

    doc:=public.get_my_marketplace_identity_documents();
    docs_owned:=(doc#>>'{front,asset_id}' IS NULL OR (doc#>>'{front,asset_id}')::uuid=ANY(own_assets))
      AND (doc#>>'{back,asset_id}' IS NULL OR (doc#>>'{back,asset_id}')::uuid=ANY(own_assets));
    checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
      'check','identity_document_assets_belong_to_actor','pass',coalesce(docs_owned,false),
      'documents_returned',(CASE WHEN doc#>>'{front,asset_id}' IS NULL THEN 0 ELSE 1 END)+
        (CASE WHEN doc#>>'{back,asset_id}' IS NULL THEN 0 ELSE 1 END)));

    foreign_job_rows:=0; returned_jobs:=0;
    FOREACH scope IN ARRAY ARRAY['active','scheduled','history'] LOOP
      SELECT foreign_job_rows+count(*) FILTER (WHERE j.job_id=ANY(foreign_jobs)),
        returned_jobs+count(*) INTO foreign_job_rows,returned_jobs
        FROM public.list_my_marketplace_jobs(scope,100,NULL,NULL) j;
    END LOOP;
    checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
      'check','driver_jobs_exclude_other_drivers','pass',foreign_job_rows=0,
      'foreign_sample_jobs',coalesce(cardinality(foreign_jobs),0),'returned_jobs',returned_jobs));

    denied:=false; error_code:=NULL;
    BEGIN
      PERFORM public.admin_confirm_marketplace_topup(pid,
        '00000000-0000-4000-8000-000000000001'::uuid,
        '00000000-0000-4000-8000-000000000002'::uuid);
    EXCEPTION WHEN OTHERS THEN
      error_code:=SQLSTATE; denied:=SQLSTATE='42501';
    END;
    checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
      'check','nonstaff_cannot_confirm_topup','pass',denied,'sqlstate',error_code));

    denied:=false; error_code:=NULL;
    BEGIN
      PERFORM * FROM public.admin_list_marketplace_wallets(pid,1,NULL,NULL);
    EXCEPTION WHEN OTHERS THEN
      error_code:=SQLSTATE; denied:=SQLSTATE='42501';
    END;
    checks:=checks||jsonb_build_array(jsonb_build_object('sample',sample_number,
      'check','nonstaff_cannot_list_admin_wallets','pass',denied,'sqlstate',error_code));
    EXECUTE 'RESET ROLE';
  END LOOP;
  PERFORM set_config('tuktuk.security_audit_result',checks::text,true);
END;
$audit$;
SELECT current_setting('transaction_read_only') AS read_only,
  current_setting('tuktuk.security_audit_result')::jsonb AS checks;
ROLLBACK;
