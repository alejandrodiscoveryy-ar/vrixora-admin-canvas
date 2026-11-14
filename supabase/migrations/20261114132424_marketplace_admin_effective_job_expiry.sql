-- Applied to production as 20261114132424. Projected expiry only; no job history mutation.
do $migration$
declare
  fn text;
  old_part text;
  new_part text;
  effective text := 'case when j.status=''published'' and j.assigned_driver_user_id is null and j.expires_at<=now() then ''expired'' else j.status end';
begin
  select pg_get_functiondef('public.admin_list_marketplace_jobs(uuid,text,text,integer,timestamptz,uuid)'::regprocedure) into fn;
  old_part := 'j.id,j.status,j.service_code';
  new_part := 'j.id,'||effective||',j.service_code';
  if (length(fn)-length(replace(fn,old_part,'')))/length(old_part)<>1 then raise exception 'ADMIN_JOB_LIST_PROJECTION_CHANGED'; end if;
  fn:=replace(fn,old_part,new_part);
  old_part := '(target_status is null or j.status=target_status)';
  new_part := '(target_status is null or ('||effective||')=target_status)';
  if (length(fn)-length(replace(fn,old_part,'')))/length(old_part)<>1 then raise exception 'ADMIN_JOB_LIST_FILTER_CHANGED'; end if;
  execute replace(fn,old_part,new_part);

  select pg_get_functiondef('public.admin_get_marketplace_job_detail(uuid,uuid)'::regprocedure) into fn;
  old_part := '''status'',j.status,';
  new_part := '''status'','||effective||',';
  if (length(fn)-length(replace(fn,old_part,'')))/length(old_part)<>1 then raise exception 'ADMIN_JOB_DETAIL_PROJECTION_CHANGED'; end if;
  execute replace(fn,old_part,new_part);

  select pg_get_functiondef('public.admin_get_marketplace_overview(uuid)'::regprocedure) into fn;
  old_part := 'j.test_deleted_at is null and j.status=''published''';
  new_part := old_part||' and (j.expires_at is null or j.expires_at>now())';
  if (length(fn)-length(replace(fn,old_part,'')))/length(old_part)<>1 then raise exception 'ADMIN_JOB_OVERVIEW_CHANGED'; end if;
  execute replace(fn,old_part,new_part);
end
$migration$;
