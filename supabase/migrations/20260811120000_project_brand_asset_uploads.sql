-- Public project branding assets with owner-only uploads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-branding',
  'project-branding',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Project brand assets are visible to authorized managers" on storage.objects;
create policy "Project brand assets are visible to authorized managers"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-branding'
  and exists (
    select 1
    from public.projects project
    where project.id::text = (storage.foldername(name))[1]
      and app_private.has_project_permission(project.id, 'settings.manage')
  )
);

drop policy if exists "Project brand assets can be uploaded by authorized managers" on storage.objects;
create policy "Project brand assets can be uploaded by authorized managers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-branding'
  and name ~ '^[0-9a-fA-F-]{36}/(logo|favicon)-[0-9a-fA-F-]{36}\.(png|jpg|webp|ico)$'
  and exists (
    select 1
    from public.projects project
    where project.id::text = (storage.foldername(name))[1]
      and app_private.has_project_permission(project.id, 'settings.manage')
  )
);
