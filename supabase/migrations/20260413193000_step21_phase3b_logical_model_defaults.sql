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
  v_default_logical_model text;
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

  v_default_logical_model :=
    case
      when p_use_case_type = 'text_generation' then 'dyno-chat-1'
      when p_use_case_type = 'embeddings' then 'dyno-embeddings-1'
      else 'dyno-embeddings-1'
    end;

  insert into public.project_configs (project_id, logical_model)
  values (v_project_id, v_default_logical_model);

  return v_project_id;
end;
$$;
