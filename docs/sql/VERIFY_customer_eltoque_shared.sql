-- Read-only checks. No token values, cron commands or environment secrets.
select version, name from supabase_migrations.schema_migrations where version = '20261011141714';
select tgname, tgenabled from pg_trigger
where not tgisinternal and tgrelid = 'public.project_exchange_rate_history'::regclass
  and tgname = 'trg_marketplace_customer_eltoque_push';
select jobname, schedule, active from cron.job where jobname like '%push%';
select relname, relrowsecurity from pg_class
where oid in ('public.marketplace_customer_eltoque_push_subscriptions'::regclass,
              'public.marketplace_customer_eltoque_push_deliveries'::regclass);
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_name in ('marketplace_customer_eltoque_push_subscriptions','marketplace_customer_eltoque_push_deliveries')
  and grantee in ('anon','authenticated','PUBLIC','service_role');
select count(*) subscriptions from public.marketplace_customer_eltoque_push_subscriptions;
select status, count(*) deliveries from public.marketplace_customer_eltoque_push_deliveries group by status;
select count(*) history from public.project_exchange_rate_history;
