alter table public.customers
  add column if not exists email text;

create unique index if not exists customers_project_whatsapp_phone_unique
  on public.customers(project_id, whatsapp_phone);

create index if not exists customers_project_email_idx
  on public.customers(project_id, email)
  where email is not null;

create or replace function public.start_marketplace_customer_session(
  target_display_name text,
  target_whatsapp_phone text,
  target_email text,
  target_session_token text,
  target_idempotency_key uuid
)
returns table(
  session_id uuid,
  customer_id uuid,
  expires_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  target_project_id uuid;
  normalized_name text := nullif(btrim(target_display_name), '');
  normalized_phone text;
  normalized_email text := nullif(lower(btrim(target_email)), '');
  token_digest text;
  existing_session public.marketplace_customer_sessions%rowtype;
  existing_customer public.customers%rowtype;
  resolved_customer_id uuid;
  created_session_id uuid;
  expires_value timestamptz := now() + interval '30 days';
begin
  if normalized_name is null then
    raise exception 'CUSTOMER_DISPLAY_NAME_REQUIRED' using errcode='22023';
  end if;

  normalized_phone := nullif(
    regexp_replace(btrim(coalesce(target_whatsapp_phone,'')), '[[:space:]()-]', '', 'g'),
    ''
  );

  if normalized_phone is null or normalized_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'CUSTOMER_WHATSAPP_INVALID' using errcode='22023';
  end if;

  if normalized_email is not null then
    if char_length(normalized_email) > 254
       or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then
      raise exception 'CUSTOMER_EMAIL_INVALID' using errcode='22023';
    end if;
  end if;

  if target_session_token is null
     or char_length(target_session_token) < 32
     or char_length(target_session_token) > 512
  then
    raise exception 'CUSTOMER_SESSION_INVALID' using errcode='22023';
  end if;

  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;

  select project.id
  into target_project_id
  from public.projects project
  where project.slug='tuktuk-control';

  if target_project_id is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND';
  end if;

  token_digest := encode(
    extensions.digest(convert_to(target_session_token,'UTF8'),'sha256'),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tuktuk:customer-session:idempotency:'
      || target_project_id::text || ':' || target_idempotency_key::text,
      0
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tuktuk:customer-session:token:'
      || target_project_id::text || ':' || token_digest,
      0
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tuktuk:customer:phone:'
      || target_project_id::text || ':' || normalized_phone,
      0
    )
  );

  select *
  into existing_session
  from public.marketplace_customer_sessions session
  where session.project_id=target_project_id
    and session.start_idempotency_key=target_idempotency_key
  for update;

  if found then
    select *
    into existing_customer
    from public.customers customer
    where customer.project_id=target_project_id
      and customer.id=existing_session.customer_id
    for update;

    if existing_session.token_hash=token_digest
       and existing_customer.whatsapp_phone=normalized_phone
       and btrim(existing_customer.display_name)=normalized_name
       and (
         normalized_email is null
         or existing_customer.email is not distinct from normalized_email
       )
    then
      return query
      select existing_session.id,
             existing_session.customer_id,
             existing_session.expires_at,
             now();
      return;
    end if;

    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
      using errcode='22023';
  end if;

  select *
  into existing_session
  from public.marketplace_customer_sessions session
  where session.project_id=target_project_id
    and session.token_hash=token_digest
  for update;

  if found then
    select *
    into existing_customer
    from public.customers customer
    where customer.project_id=target_project_id
      and customer.id=existing_session.customer_id
    for update;

    if existing_session.status='active'
       and now()<existing_session.expires_at
       and existing_customer.whatsapp_phone=normalized_phone
    then
      update public.customers
      set display_name=normalized_name,
          email=coalesce(normalized_email,email),
          updated_at=now()
      where project_id=target_project_id
        and id=existing_customer.id;

      return query
      select existing_session.id,
             existing_session.customer_id,
             existing_session.expires_at,
             now();
      return;
    end if;

    if existing_session.status<>'active'
       or now()>=existing_session.expires_at
    then
      raise exception 'CUSTOMER_SESSION_TOKEN_REQUIRES_ROTATION'
        using errcode='22023';
    end if;

    raise exception 'CUSTOMER_SESSION_TOKEN_ALREADY_IN_USE'
      using errcode='22023';
  end if;

  select *
  into existing_customer
  from public.customers customer
  where customer.project_id=target_project_id
    and customer.whatsapp_phone=normalized_phone
  for update;

  if found then
    resolved_customer_id:=existing_customer.id;

    update public.customers
    set display_name=normalized_name,
        email=coalesce(normalized_email,email),
        updated_at=now()
    where project_id=target_project_id
      and id=resolved_customer_id;
  else
    insert into public.customers(
      project_id,
      display_name,
      whatsapp_phone,
      email
    )
    values(
      target_project_id,
      normalized_name,
      normalized_phone,
      normalized_email
    )
    returning id into resolved_customer_id;
  end if;

  insert into public.marketplace_customer_sessions(
    project_id,
    customer_id,
    token_hash,
    start_idempotency_key,
    expires_at
  )
  values(
    target_project_id,
    resolved_customer_id,
    token_digest,
    target_idempotency_key,
    expires_value
  )
  returning id into created_session_id;

  return query
  select created_session_id,
         resolved_customer_id,
         expires_value,
         now();
end;
$function$;

create or replace function public.start_marketplace_customer_session(
  target_display_name text,
  target_whatsapp_phone text,
  target_session_token text,
  target_idempotency_key uuid
)
returns table(
  session_id uuid,
  customer_id uuid,
  expires_at timestamptz,
  server_time timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select *
  from public.start_marketplace_customer_session(
    target_display_name,
    target_whatsapp_phone,
    null::text,
    target_session_token,
    target_idempotency_key
  );
$function$;

revoke execute on function public.start_marketplace_customer_session(
  text,text,text,text,uuid
) from public,anon,authenticated;

grant execute on function public.start_marketplace_customer_session(
  text,text,text,text,uuid
) to service_role;

revoke execute on function public.start_marketplace_customer_session(
  text,text,text,uuid
) from public,anon,authenticated;

grant execute on function public.start_marketplace_customer_session(
  text,text,text,uuid
) to service_role;

notify pgrst,'reload schema';