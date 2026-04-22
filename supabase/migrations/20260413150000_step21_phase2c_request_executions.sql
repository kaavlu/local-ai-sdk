create table if not exists public.request_executions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  api_key_id uuid references public.project_api_keys(id) on delete set null,
  endpoint text not null,
  use_case text,
  logical_model text,
  execution_path text,
  execution_reason text,
  status text not null,
  http_status integer,
  latency_ms integer,
  input_count integer,
  error_type text,
  error_code text,
  request_id text,
  upstream_model text,
  local_job_id text,
  created_at timestamptz not null default now(),
  constraint request_executions_execution_path_check check (
    execution_path is null or execution_path in ('local', 'cloud', 'unknown')
  ),
  constraint request_executions_status_check check (status in ('success', 'error')),
  constraint request_executions_http_status_check check (
    http_status is null or (http_status >= 100 and http_status <= 599)
  ),
  constraint request_executions_latency_ms_check check (latency_ms is null or latency_ms >= 0),
  constraint request_executions_input_count_check check (input_count is null or input_count >= 0)
);

create index if not exists idx_request_executions_project_created_at
  on public.request_executions(project_id, created_at desc);

create index if not exists idx_request_executions_api_key_id
  on public.request_executions(api_key_id);

create index if not exists idx_request_executions_status
  on public.request_executions(status);

alter table public.request_executions enable row level security;

drop policy if exists request_executions_select_own on public.request_executions;
create policy request_executions_select_own
on public.request_executions
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = request_executions.project_id
      and w.owner_user_id = auth.uid()
  )
);
