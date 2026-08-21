revoke all on function public.get_my_project_exchange_rate(uuid) from public, anon;
grant execute on function public.get_my_project_exchange_rate(uuid) to authenticated;
revoke all on function public.mark_my_notification_read(bigint) from public, anon;
grant execute on function public.mark_my_notification_read(bigint) to authenticated;