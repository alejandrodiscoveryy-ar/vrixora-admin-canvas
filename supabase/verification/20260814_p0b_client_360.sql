-- P0-B Client 360 integration verification.
-- Run in an isolated database after the matching migration and replace placeholders.

create or replace function pg_temp.assert_raises(statement text, expected_message text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'TEST_FAILED: expected %, got %',expected_message,sqlerrm;
  end;
  raise exception 'TEST_FAILED: expected error % but statement succeeded',expected_message;
end;
$$;

do $$
begin
  if has_function_privilege('anon','public.admin_get_client_360(uuid,uuid)','execute') then
    raise exception 'TEST_FAILED: anonymous role can execute Client 360';
  end if;
  if not has_function_privilege('authenticated','public.admin_get_client_360(uuid,uuid)','execute') then
    raise exception 'TEST_FAILED: authenticated role cannot execute Client 360';
  end if;
  if not exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname='admin_get_client_360'
      and procedure.prosecdef and procedure.proconfig @> array['search_path=']
  ) then
    raise exception 'TEST_FAILED: Client 360 is not a hardened security definer function';
  end if;
end;
$$;

-- Owner can read every authorized block for a client in the project.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
do $$
declare result jsonb;
begin
  result := public.admin_get_client_360(':project_a_id'::uuid,':client_with_payment_id'::uuid);
  if result->'client'->>'id'<>':client_with_payment_id' then
    raise exception 'TEST_FAILED: wrong Client 360 identity';
  end if;
  if not ((result->'permissions'->>'licenses')::boolean
      and (result->'permissions'->>'payments')::boolean
      and (result->'permissions'->>'commercial')::boolean
      and (result->'permissions'->>'audit')::boolean) then
    raise exception 'TEST_FAILED: owner blocks are incomplete';
  end if;
  if jsonb_array_length(result->'billing'->'payments')=0 then
    raise exception 'TEST_FAILED: paid client has no billing history';
  end if;
end;
$$;
rollback;

-- Accounting gets operational customer, license and billing data, but not commercial/audit data.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
do $$
declare result jsonb;
begin
  result := public.admin_get_client_360(':project_a_id'::uuid,':trial_client_id'::uuid);
  if not (result->'permissions'->>'licenses')::boolean
      or not (result->'permissions'->>'payments')::boolean then
    raise exception 'TEST_FAILED: accounting operational blocks are missing';
  end if;
  if (result->'permissions'->>'commercial')::boolean
      or (result->'permissions'->>'audit')::boolean
      or result->'commercial' is not null then
    raise exception 'TEST_FAILED: accounting received forbidden Client 360 data';
  end if;
end;
$$;
rollback;

-- Marketing sees the customer/commercial view without financial or license details.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
do $$
declare result jsonb;
begin
  result := public.admin_get_client_360(':project_a_id'::uuid,':commercial_client_id'::uuid);
  if not (result->'permissions'->>'commercial')::boolean then
    raise exception 'TEST_FAILED: marketing commercial block is missing';
  end if;
  if (result->'permissions'->>'payments')::boolean
      or (result->'permissions'->>'licenses')::boolean
      or result->'billing' is not null or result->'license' is not null then
    raise exception 'TEST_FAILED: marketing received forbidden Client 360 data';
  end if;
end;
$$;
rollback;

-- Unauthorized users and cross-project client identifiers are rejected.
begin;
select set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_get_client_360(':project_a_id'::uuid,':client_with_payment_id'::uuid)$$,
  'PERMISSION_DENIED:customers.view'
);
rollback;

begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_get_client_360(':project_a_id'::uuid,':project_b_client_id'::uuid)$$,
  'CLIENT_NOT_FOUND'
);
do $$
begin
  if exists (
    select 1 from public.admin_list_registered_clients(':project_a_id'::uuid)
    where user_id=':project_b_client_id'::uuid
  ) then
    raise exception 'TEST_FAILED: client list leaked another project';
  end if;
end;
$$;
rollback;
