create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  use_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  use_case_type text not null,
  strategy_preset text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_use_case_type_check check (
    use_case_type in (
      'text_generation',
      'text_classification',
      'image_classification',
      'vision_language',
      'embeddings',
      'speech_audio',
      'custom'
    )
  ),
  constraint projects_strategy_preset_check check (
    strategy_preset in ('local_first', 'balanced', 'cloud_first')
  ),
  constraint projects_status_check check (status in ('draft', 'active'))
);

create table if not exists public.project_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  local_model text,
  cloud_model text,
  battery_min_percent integer,
  idle_min_seconds integer,
  requires_charging boolean not null default false,
  wifi_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_configs_battery_min_percent_check check (
    battery_min_percent is null
    or (battery_min_percent >= 0 and battery_min_percent <= 100)
  ),
  constraint project_configs_idle_min_seconds_check check (
    idle_min_seconds is null or idle_min_seconds >= 0
  )
);

create index if not exists idx_workspaces_owner_user_id
  on public.workspaces(owner_user_id);

create index if not exists idx_projects_workspace_id
  on public.projects(workspace_id);

create index if not exists idx_projects_updated_at
  on public.projects(updated_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row
execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists set_project_configs_updated_at on public.project_configs;
create trigger set_project_configs_updated_at
before update on public.project_configs
for each row
execute function public.set_updated_at();

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

  v_workspace_name := coalesce(v_full_name, 'My Workspace');
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_signup();

create or replace function public.create_project_with_default_config(
  p_workspace_id uuid,
  p_name text,
  p_description text,
  p_use_case_type text,
  p_strategy_preset text
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_project_id uuid;
begin
  insert into public.projects (
    workspace_id,
    name,
    description,
    use_case_type,
    strategy_preset
  )
  values (
    p_workspace_id,
    p_name,
    p_description,
    p_use_case_type,
    p_strategy_preset
  )
  returning id into v_project_id;

  insert into public.project_configs (project_id)
  values (v_project_id);

  return v_project_id;
end;
$$;

revoke all on function public.create_project_with_default_config(uuid, text, text, text, text) from public;
grant execute on function public.create_project_with_default_config(uuid, text, text, text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.project_configs enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own
on public.workspaces
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists workspaces_update_own on public.workspaces;
create policy workspaces_update_own
on public.workspaces
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own
on public.projects
for select
to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = projects.workspace_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own
on public.projects
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspaces w
    where w.id = projects.workspace_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own
on public.projects
for update
to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = projects.workspace_id
      and w.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspaces w
    where w.id = projects.workspace_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own
on public.projects
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = projects.workspace_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists project_configs_select_own on public.project_configs;
create policy project_configs_select_own
on public.project_configs
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_configs.project_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists project_configs_insert_own on public.project_configs;
create policy project_configs_insert_own
on public.project_configs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_configs.project_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists project_configs_update_own on public.project_configs;
create policy project_configs_update_own
on public.project_configs
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_configs.project_id
      and w.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_configs.project_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists project_configs_delete_own on public.project_configs;
create policy project_configs_delete_own
on public.project_configs
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_configs.project_id
      and w.owner_user_id = auth.uid()
  )
);
