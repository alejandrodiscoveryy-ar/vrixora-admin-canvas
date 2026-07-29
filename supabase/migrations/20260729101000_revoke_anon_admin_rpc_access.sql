revoke all on function public.admin_add_project_member_by_email(uuid, text) from anon;
revoke all on function public.admin_remove_project_member(uuid, uuid) from anon;
revoke all on function public.admin_update_project_settings(
  uuid, text, text, boolean, boolean
) from anon;
