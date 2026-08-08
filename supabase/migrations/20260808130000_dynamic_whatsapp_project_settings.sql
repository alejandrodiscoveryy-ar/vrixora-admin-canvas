-- Dynamic WhatsApp configuration. projects.whatsapp remains the fallback number.

insert into public.project_permissions(code,name,category)
values('whatsapp_settings.manage','Gestionar configuración global de WhatsApp','settings')
on conflict(code) do update set name=excluded.name,category=excluded.category;
insert into public.project_role_permissions(role_code,permission_code)
values('owner','whatsapp_settings.manage') on conflict do nothing;
delete from public.project_role_permissions
where permission_code='whatsapp_settings.manage' and role_code<>'owner';

create table public.project_whatsapp_settings(
  project_id uuid primary key references public.projects(id) on update cascade on delete cascade,
  support_number text check(support_number is null or support_number~'^\+[1-9][0-9]{7,14}$'),
  payment_number text check(payment_number is null or payment_number~'^\+[1-9][0-9]{7,14}$'),
  support_button_text text not null default 'Contactar soporte'
    check(char_length(btrim(support_button_text)) between 1 and 80),
  payment_button_text text not null default 'Pagar, activar o renovar'
    check(char_length(btrim(payment_button_text)) between 1 and 80),
  support_template text not null default
    'Hola, necesito ayuda con {{aplicacion}}. Mi nombre es {{nombre}} y mi correo es {{correo}}.'
    check(char_length(btrim(support_template)) between 1 and 2000),
  payment_template text not null default
    'Hola, deseo {{tipo_solicitud}} en {{aplicacion}}. Nombre: {{nombre}}. Correo: {{correo}}. Licencia: {{licencia}}. Plan actual: {{plan_actual}}. Plan solicitado: {{plan_solicitado}}. Vencimiento: {{fecha_vencimiento}}.'
    check(char_length(btrim(payment_template)) between 1 and 2000),
  support_enabled boolean not null default false,
  payment_enabled boolean not null default false,
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.project_whatsapp_settings(project_id,support_enabled,payment_enabled)
select id,whatsapp is not null,whatsapp is not null from public.projects
on conflict(project_id) do nothing;

alter table public.project_whatsapp_settings enable row level security;
revoke all on public.project_whatsapp_settings from public,anon,authenticated;
create trigger audit_project_whatsapp_settings_changes
after insert or update or delete on public.project_whatsapp_settings
for each row execute function app_private.capture_audit_event();

create or replace function app_private.assert_whatsapp_template(
  target_template text,allowed_variables text[]
) returns void language plpgsql immutable security invoker set search_path=''
as $$
declare variable_name text; remainder text;
begin
  if nullif(btrim(target_template),'') is null or char_length(target_template)>2000 then
    raise exception 'INVALID_WHATSAPP_TEMPLATE' using errcode='22023';
  end if;
  for variable_name in
    select matches[1] from regexp_matches(target_template,'\{\{([a-z_]+)\}\}','g') as matches
  loop
    if not variable_name=any(allowed_variables) then
      raise exception 'WHATSAPP_TEMPLATE_VARIABLE_NOT_ALLOWED:%',variable_name using errcode='22023';
    end if;
  end loop;
  remainder:=regexp_replace(target_template,'\{\{[a-z_]+\}\}','','g');
  if remainder like '%{{%' or remainder like '%}}%' then
    raise exception 'MALFORMED_WHATSAPP_TEMPLATE_VARIABLE' using errcode='22023';
  end if;
end $$;
revoke all on function app_private.assert_whatsapp_template(text,text[])
from public,anon,authenticated;

create or replace function app_private.protect_project_whatsapp_fallback()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  if new.whatsapp is distinct from old.whatsapp then
    perform app_private.require_project_permission(new.id,'whatsapp_settings.manage');
    new.whatsapp:=nullif(btrim(new.whatsapp),'');
    if new.whatsapp is not null and new.whatsapp!~'^\+[1-9][0-9]{7,14}$' then
      raise exception 'INVALID_WHATSAPP_NUMBER' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function app_private.protect_project_whatsapp_fallback()
from public,anon,authenticated;
create trigger protect_project_whatsapp_fallback
before update of whatsapp on public.projects
for each row execute function app_private.protect_project_whatsapp_fallback();

create or replace function public.admin_get_whatsapp_settings(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$ declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'whatsapp_settings.manage');
  select jsonb_build_object(
    'project_id',p.id,'fallback_number',p.whatsapp,
    'support_number',s.support_number,'payment_number',s.payment_number,
    'support_button_text',s.support_button_text,'payment_button_text',s.payment_button_text,
    'support_template',s.support_template,'payment_template',s.payment_template,
    'support_enabled',s.support_enabled,'payment_enabled',s.payment_enabled,
    'version',s.version,'updated_at',s.updated_at)
  into result from public.projects p join public.project_whatsapp_settings s on s.project_id=p.id
  where p.id=target_project_id;
  if result is null then raise exception 'WHATSAPP_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
  return result;
end $$;

create or replace function public.admin_update_whatsapp_settings(
  target_project_id uuid,target_fallback_number text,target_support_number text,
  target_payment_number text,target_support_button_text text,target_payment_button_text text,
  target_support_template text,target_payment_template text,
  target_support_enabled boolean,target_payment_enabled boolean
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor uuid; fallback_number text:=nullif(btrim(target_fallback_number),'');
  support_number text:=nullif(btrim(target_support_number),'');
  payment_number text:=nullif(btrim(target_payment_number),'');
begin
  actor:=app_private.require_project_permission(target_project_id,'whatsapp_settings.manage');
  if fallback_number is not null and fallback_number!~'^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_WHATSAPP_FALLBACK_NUMBER' using errcode='22023'; end if;
  if support_number is not null and support_number!~'^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_WHATSAPP_SUPPORT_NUMBER' using errcode='22023'; end if;
  if payment_number is not null and payment_number!~'^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_WHATSAPP_PAYMENT_NUMBER' using errcode='22023'; end if;
  if coalesce(target_support_enabled,false) and coalesce(support_number,fallback_number) is null then
    raise exception 'WHATSAPP_SUPPORT_NUMBER_REQUIRED' using errcode='22023'; end if;
  if coalesce(target_payment_enabled,false) and coalesce(payment_number,fallback_number) is null then
    raise exception 'WHATSAPP_PAYMENT_NUMBER_REQUIRED' using errcode='22023'; end if;
  if char_length(btrim(target_support_button_text)) not between 1 and 80
    or char_length(btrim(target_payment_button_text)) not between 1 and 80 then
    raise exception 'INVALID_WHATSAPP_BUTTON_TEXT' using errcode='22023'; end if;
  perform app_private.assert_whatsapp_template(target_support_template,
    array['nombre','correo','aplicacion']::text[]);
  perform app_private.assert_whatsapp_template(target_payment_template,
    array['nombre','correo','licencia','aplicacion','plan_actual','plan_solicitado',
      'fecha_vencimiento','tipo_solicitud']::text[]);
  update public.projects set whatsapp=fallback_number,updated_at=now() where id=target_project_id;
  if not found then raise exception 'PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.project_whatsapp_settings(
    project_id,support_number,payment_number,support_button_text,payment_button_text,
    support_template,payment_template,support_enabled,payment_enabled,version,updated_at,updated_by)
  values(target_project_id,support_number,payment_number,btrim(target_support_button_text),
    btrim(target_payment_button_text),btrim(target_support_template),btrim(target_payment_template),
    coalesce(target_support_enabled,false),coalesce(target_payment_enabled,false),1,now(),actor)
  on conflict(project_id) do update set support_number=excluded.support_number,
    payment_number=excluded.payment_number,support_button_text=excluded.support_button_text,
    payment_button_text=excluded.payment_button_text,support_template=excluded.support_template,
    payment_template=excluded.payment_template,support_enabled=excluded.support_enabled,
    payment_enabled=excluded.payment_enabled,version=public.project_whatsapp_settings.version+1,
    updated_at=now(),updated_by=actor;
  return public.admin_get_whatsapp_settings(target_project_id);
end $$;

create or replace function public.get_public_whatsapp_settings(target_project_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
select jsonb_build_object(
  'project_id',p.id,'application',p.name,
  'support',jsonb_build_object('enabled',s.support_enabled and coalesce(s.support_number,p.whatsapp) is not null,
    'number',coalesce(s.support_number,p.whatsapp),'button_text',s.support_button_text,'template',s.support_template),
  'payment',jsonb_build_object('enabled',s.payment_enabled and coalesce(s.payment_number,p.whatsapp) is not null,
    'number',coalesce(s.payment_number,p.whatsapp),'button_text',s.payment_button_text,'template',s.payment_template,
    'allowed_variables',jsonb_build_array('nombre','correo','licencia','aplicacion','plan_actual',
      'plan_solicitado','fecha_vencimiento','tipo_solicitud')),
  'version',s.version,'updated_at',s.updated_at)
from public.projects p join public.project_whatsapp_settings s on s.project_id=p.id
where p.id=target_project_id and p.status='active';
$$;

revoke all on function public.admin_get_whatsapp_settings(uuid) from public,anon,authenticated;
revoke all on function public.admin_update_whatsapp_settings(uuid,text,text,text,text,text,text,text,boolean,boolean)
from public,anon,authenticated;
revoke all on function public.get_public_whatsapp_settings(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_whatsapp_settings(uuid) to authenticated;
grant execute on function public.admin_update_whatsapp_settings(uuid,text,text,text,text,text,text,text,boolean,boolean)
to authenticated;
grant execute on function public.get_public_whatsapp_settings(uuid) to anon,authenticated;
