create or replace function public.admin_list_marketplace_payment_methods(
  target_project_id uuid
)
returns setof public.marketplace_payment_methods
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform app_private.require_project_permission(
    target_project_id,
    'payments.view'
  );

  return query
  select m.*
  from public.marketplace_payment_methods m
  where m.project_id = target_project_id
  order by m.sort_order, m.code;
end;
$function$;

revoke all on function public.admin_list_marketplace_payment_methods(uuid) from public;
grant execute on function public.admin_list_marketplace_payment_methods(uuid) to authenticated;
