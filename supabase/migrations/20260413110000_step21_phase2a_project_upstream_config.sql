alter table public.project_configs
  add column if not exists logical_model text not null default 'dyno-embeddings-1',
  add column if not exists upstream_provider_type text not null default 'openai_compatible',
  add column if not exists upstream_base_url text,
  add column if not exists upstream_model text,
  add column if not exists fallback_enabled boolean not null default true,
  add column if not exists upstream_api_key_encrypted text,
  add column if not exists upstream_api_key_last_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_configs_upstream_provider_type_check'
  ) then
    alter table public.project_configs
      add constraint project_configs_upstream_provider_type_check
      check (upstream_provider_type in ('openai_compatible'));
  end if;
end
$$;

update public.project_configs
set upstream_model = cloud_model
where upstream_model is null
  and cloud_model is not null;
