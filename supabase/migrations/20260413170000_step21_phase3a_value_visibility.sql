alter table public.project_configs
  add column if not exists estimated_cloud_cost_per_request_usd numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_configs_estimated_cloud_cost_per_request_usd_check'
  ) then
    alter table public.project_configs
      add constraint project_configs_estimated_cloud_cost_per_request_usd_check
      check (
        estimated_cloud_cost_per_request_usd is null
        or estimated_cloud_cost_per_request_usd >= 0
      );
  end if;
end
$$;
