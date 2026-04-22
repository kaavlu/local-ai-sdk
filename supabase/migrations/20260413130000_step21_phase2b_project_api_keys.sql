create table if not exists public.project_api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text,
  key_prefix text not null,
  key_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists idx_project_api_keys_project_id
  on public.project_api_keys(project_id);

create index if not exists idx_project_api_keys_active
  on public.project_api_keys(project_id)
  where revoked_at is null;

create index if not exists idx_project_api_keys_key_prefix
  on public.project_api_keys(key_prefix);

drop trigger if exists set_project_api_keys_updated_at on public.project_api_keys;
create trigger set_project_api_keys_updated_at
before update on public.project_api_keys
for each row
execute function public.set_updated_at();

alter table public.project_api_keys enable row level security;

drop policy if exists project_api_keys_select_own on public.project_api_keys;
create policy project_api_keys_select_own
on public.project_api_keys
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_api_keys.project_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists project_api_keys_insert_own on public.project_api_keys;
create policy project_api_keys_insert_own
on public.project_api_keys
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_api_keys.project_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists project_api_keys_update_own on public.project_api_keys;
create policy project_api_keys_update_own
on public.project_api_keys
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_api_keys.project_id
      and w.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_api_keys.project_id
      and w.owner_user_id = auth.uid()
  )
);

drop policy if exists project_api_keys_delete_own on public.project_api_keys;
create policy project_api_keys_delete_own
on public.project_api_keys
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = project_api_keys.project_id
      and w.owner_user_id = auth.uid()
  )
);
