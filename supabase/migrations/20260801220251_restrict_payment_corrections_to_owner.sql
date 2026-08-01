-- Existing payment records may only be corrected or deleted by the project owner.

insert into public.project_permissions (code, name, category)
values ('payments.correct', 'Corregir pagos registrados', 'payments')
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category;

insert into public.project_role_permissions (role_code, permission_code)
values ('owner', 'payments.correct')
on conflict do nothing;

delete from public.project_role_permissions
where permission_code = 'payments.correct'
  and role_code <> 'owner';

create or replace function public.admin_update_payment_record(
  target_payment_id uuid,
  target_amount numeric,
  target_currency text,
  target_method text,
  target_reference text,
  target_status text,
  target_notes text,
  target_adjustment_reason text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  previous_payment public.payments%rowtype;
  updated_payment public.payments%rowtype;
  reason text := nullif(btrim(target_adjustment_reason), '');
begin
  select * into previous_payment from public.payments
  where id = target_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  actor := app_private.require_project_permission(previous_payment.project_id, 'payments.correct');
  if reason is null then raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode = '22023'; end if;
  if target_status not in ('pending','paid','cancelled','refunded','complimentary') then raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023'; end if;
  if target_currency not in ('CUP','USD','EUR') then raise exception 'INVALID_CURRENCY' using errcode = '22023'; end if;
  if target_method not in ('card','transfer','cash','paypal') then raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023'; end if;
  if target_amount < 0 or target_amount > previous_payment.list_price then raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023'; end if;
  if target_status = 'complimentary' and target_amount <> 0 then raise exception 'COMPLIMENTARY_PAYMENT_MUST_BE_ZERO' using errcode = '22023'; end if;
  if nullif(btrim(target_reference), '') is null then raise exception 'PAYMENT_REFERENCE_REQUIRED' using errcode = '22023'; end if;

  update public.payments set amount=target_amount, discount=list_price-target_amount,
    currency=target_currency, method=target_method, reference=btrim(target_reference),
    notes=nullif(btrim(target_notes),'')
  where id=target_payment_id returning * into updated_payment;
  if previous_payment.status is distinct from target_status then
    select * into updated_payment from public.admin_update_payment_status(target_payment_id,target_status,target_notes);
  end if;
  insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata)
  values(updated_payment.project_id,updated_payment.license_id,'payment_updated',
    'Pago corregido por el superadministrador',actor,
    jsonb_build_object('payment_id',updated_payment.id,'reason',reason,
      'before',to_jsonb(previous_payment)-'recorded_by','after',to_jsonb(updated_payment)-'recorded_by'));
  return updated_payment;
end;
$$;

create or replace function public.admin_delete_payment_record(target_payment_id uuid,target_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid; removed_payment public.payments%rowtype;
  reason text := nullif(btrim(target_reason),'');
begin
  select * into removed_payment from public.payments where id=target_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  actor := app_private.require_project_permission(removed_payment.project_id,'payments.correct');
  if reason is null then raise exception 'DELETE_REASON_REQUIRED' using errcode='22023'; end if;
  insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata)
  values(removed_payment.project_id,removed_payment.license_id,'payment_deleted',
    'Pago eliminado por el superadministrador',actor,
    jsonb_build_object('payment',to_jsonb(removed_payment)-'recorded_by','reason',reason,'license_term_unchanged',true));
  delete from public.payments where id=target_payment_id;
end;
$$;

revoke all on function public.admin_update_payment_record(uuid,numeric,text,text,text,text,text,text) from public,anon;
revoke all on function public.admin_delete_payment_record(uuid,text) from public,anon;
grant execute on function public.admin_update_payment_record(uuid,numeric,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_delete_payment_record(uuid,text) to authenticated;
