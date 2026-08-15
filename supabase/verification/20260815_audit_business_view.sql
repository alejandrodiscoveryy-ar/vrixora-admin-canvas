begin;

-- =========================================================
-- 1. Estructura y permisos
-- =========================================================

do $$
begin
  if to_regprocedure(
    'public.admin_list_business_audit_events(uuid,timestamp with time zone,timestamp with time zone,integer)'
  ) is null then
    raise exception 'AUDIT_BUSINESS_RPC_MISSING';
  end if;

  if has_function_privilege(
    'anon',
    'public.admin_list_business_audit_events(uuid,timestamp with time zone,timestamp with time zone,integer)',
    'EXECUTE'
  ) then
    raise exception 'ANON_MUST_NOT_EXECUTE_AUDIT_RPC';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_list_business_audit_events(uuid,timestamp with time zone,timestamp with time zone,integer)',
    'EXECUTE'
  ) then
    raise exception 'AUTHENTICATED_MUST_EXECUTE_AUDIT_RPC';
  end if;
end;
$$;


-- =========================================================
-- 2. Las validaciones rutinarias NO deben crear Auditoría
-- =========================================================

do $$
declare
  target_license_id uuid;
  before_count bigint;
  after_count bigint;
begin
  select license.id
    into target_license_id
  from public.licenses license
  order by license.created_at
  limit 1;

  if target_license_id is null then
    raise exception 'VERIFICATION_LICENSE_NOT_FOUND';
  end if;

  select count(*)
    into before_count
  from public.audit_events event
  where event.entity_type = 'licenses'
    and event.entity_id = target_license_id::text;

  update public.licenses
  set
    last_validation = coalesce(last_validation, now()) + interval '1 second',
    updated_at = now()
  where id = target_license_id;

  select count(*)
    into after_count
  from public.audit_events event
  where event.entity_type = 'licenses'
    and event.entity_id = target_license_id::text;

  if after_count <> before_count then
    raise exception
      'TECHNICAL_LICENSE_VALIDATION_CREATED_AUDIT_EVENT';
  end if;
end;
$$;


-- =========================================================
-- 3. Un cambio empresarial REAL sí debe auditarse
-- =========================================================

do $$
declare
  target_license_id uuid;
  before_count bigint;
  after_count bigint;
begin
  select license.id
    into target_license_id
  from public.licenses license
  order by license.created_at
  limit 1;

  select count(*)
    into before_count
  from public.audit_events event
  where event.entity_type = 'licenses'
    and event.entity_id = target_license_id::text;

  update public.licenses
  set
    notes = concat(
      coalesce(notes, ''),
      ' [AUDIT_VERIFICATION]'
    ),
    updated_at = now()
  where id = target_license_id;

  select count(*)
    into after_count
  from public.audit_events event
  where event.entity_type = 'licenses'
    and event.entity_id = target_license_id::text;

  if after_count <> before_count + 1 then
    raise exception
      'MEANINGFUL_LICENSE_CHANGE_NOT_AUDITED';
  end if;
end;
$$;


-- =========================================================
-- 4. Ejecutar RPC como Owner autenticado
-- =========================================================

select set_config(
  'request.jwt.claim.sub',
  (
    select member.user_id::text
    from public.project_members member
    where member.role = 'owner'
    order by member.created_at
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  target_project_id uuid;
  returned_rows bigint;
  reported_total bigint;
  invalid_classification bigint;
  technical_noise bigint;
  malformed_rows bigint;
begin
  select member.project_id
    into target_project_id
  from public.project_members member
  where member.user_id = auth.uid()
    and member.role = 'owner'
  order by member.created_at
  limit 1;

  if target_project_id is null then
    raise exception 'OWNER_PROJECT_NOT_FOUND';
  end if;

  select
    count(*),
    coalesce(max(result.total_count), 0)
  into
    returned_rows,
    reported_total
  from public.admin_list_business_audit_events(
    target_project_id,
    now() - interval '30 days',
    now() + interval '1 minute',
    5000
  ) result;

  if returned_rows <> reported_total then
    raise exception
      'AUDIT_TOTAL_COUNT_MISMATCH: returned %, total %',
      returned_rows,
      reported_total;
  end if;

  select count(*)
    into invalid_classification
  from public.admin_list_business_audit_events(
    target_project_id,
    now() - interval '30 days',
    now() + interval '1 minute',
    5000
  ) result
  where result.importance not in ('normal', 'important', 'critical')
     or result.area not in (
       'clientes',
       'comercial',
       'cobros',
       'licencias',
       'administracion',
       'otros'
     );

  if invalid_classification <> 0 then
    raise exception 'INVALID_AUDIT_CLASSIFICATION';
  end if;

  select count(*)
    into malformed_rows
  from public.admin_list_business_audit_events(
    target_project_id,
    now() - interval '30 days',
    now() + interval '1 minute',
    5000
  ) result
  where nullif(btrim(result.action_label), '') is null
     or nullif(btrim(result.entity_label), '') is null
     or nullif(btrim(result.actor_name), '') is null;

  if malformed_rows <> 0 then
    raise exception 'AUDIT_HUMAN_LABELS_MISSING';
  end if;

  select count(*)
    into technical_noise
  from public.admin_list_business_audit_events(
    target_project_id,
    now() - interval '30 days',
    now() + interval '1 minute',
    5000
  ) result
  where result.entity_type = 'licenses'
    and result.action = 'update'
    and (
      (
        coalesce(result.metadata->'new', '{}'::jsonb)
          - 'last_validation'
          - 'updated_at'
      )
      =
      (
        coalesce(result.metadata->'old', '{}'::jsonb)
          - 'last_validation'
          - 'updated_at'
      )
    );

  if technical_noise <> 0 then
    raise exception 'TECHNICAL_LICENSE_NOISE_VISIBLE_IN_AUDIT';
  end if;
end;
$$;


-- =========================================================
-- 5. Los pagos confirmados deben tener etiqueta humana
-- =========================================================

do $$
declare
  target_project_id uuid;
  bad_payment_labels bigint;
begin
  select member.project_id
    into target_project_id
  from public.project_members member
  where member.user_id = auth.uid()
    and member.role = 'owner'
  order by member.created_at
  limit 1;

  select count(*)
    into bad_payment_labels
  from public.admin_list_business_audit_events(
    target_project_id,
    now() - interval '30 days',
    now() + interval '1 minute',
    5000
  ) result
  where result.entity_type in ('payments', 'payment')
    and result.action = 'insert'
    and result.metadata#>>'{new,status}' = 'paid'
    and result.action_label <> 'Pago confirmado';

  if bad_payment_labels <> 0 then
    raise exception 'PAID_PAYMENT_LABEL_NOT_HUMANIZED';
  end if;
end;
$$;


-- =========================================================
-- 6. P0-E: una anulación segura debe ser crítica y conservar motivo
-- =========================================================

do $$
declare
  target_project_id uuid;
  bad_cancellations bigint;
begin
  select member.project_id
    into target_project_id
  from public.project_members member
  where member.user_id = auth.uid()
    and member.role = 'owner'
  order by member.created_at
  limit 1;

  select count(*)
    into bad_cancellations
  from public.admin_list_business_audit_events(
    target_project_id,
    now() - interval '30 days',
    now() + interval '1 minute',
    5000
  ) result
  where result.action = 'payment_cancelled_safe'
    and (
      result.importance <> 'critical'
      or result.action_label <> 'Pago anulado'
      or nullif(btrim(result.reason), '') is null
    );

  if bad_cancellations <> 0 then
    raise exception 'SAFE_PAYMENT_CANCELLATION_AUDIT_INVALID';
  end if;
end;
$$;

reset role;

rollback;