-- Allow only the deterministic icon variants generated from a project favicon master.
-- The existing permission check remains authoritative; authenticated by itself is not enough.

drop policy if exists "Project brand assets can be uploaded by authorized managers" on storage.objects;

create policy "Project brand assets can be uploaded by authorized managers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-branding'
  and (
    name ~ '^[0-9a-fA-F-]{36}/(logo|favicon)-[0-9a-fA-F-]{36}\.(png|jpg|webp|ico)$'
    or name ~ '^[0-9a-fA-F-]{36}/favicon-[0-9a-fA-F-]{36}/(favicon-(16|32|48)|pwa-(192|512)|android-launcher-192|maskable-(192|512)|shortcut-(96|192)|windows-(44|150|310)|apple-touch-180|adaptive-(foreground|background|monochrome)-432|round-(192|512)|notification-(24|48|72|96))\.png$'
  )
  and exists (
    select 1
    from public.projects project
    where project.id::text = (storage.foldername(name))[1]
      and app_private.has_project_permission(project.id, 'settings.manage')
  )
);
