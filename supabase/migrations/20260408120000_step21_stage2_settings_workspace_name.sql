create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_full_name text;
  v_workspace_name text;
  v_slug_base text;
  v_workspace_slug text;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), '')
  );

  insert into public.profiles (id, full_name, use_type)
  values (
    new.id,
    v_full_name,
    nullif(trim(new.raw_user_meta_data ->> 'use_type'), '')
  )
  on conflict (id) do nothing;

  select coalesce(v_full_name, nullif(trim(p.full_name), ''))
  into v_full_name
  from public.profiles p
  where p.id = new.id;

  v_workspace_name := coalesce(v_full_name || '''s Workspace', 'My Workspace');
  v_slug_base := lower(regexp_replace(v_workspace_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  if v_slug_base = '' then
    v_slug_base := 'workspace';
  end if;
  v_workspace_slug := v_slug_base || '-' || substr(replace(new.id::text, '-', ''), 1, 8);

  insert into public.workspaces (owner_user_id, name, slug)
  select new.id, v_workspace_name, v_workspace_slug
  where not exists (
    select 1
    from public.workspaces w
    where w.owner_user_id = new.id
  );

  return new;
end;
$$;
