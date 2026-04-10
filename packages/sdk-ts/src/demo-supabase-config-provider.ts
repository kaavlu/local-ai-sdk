import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ConfigProvider, DemoProjectConfig, DemoStrategyPreset } from './config-provider.js';

type ProjectRow = {
  id: string;
  use_case_type: string;
  strategy_preset: string;
};

type ProjectConfigRow = {
  project_id: string;
  local_model: string | null;
  cloud_model: string | null;
  requires_charging: boolean;
  wifi_only: boolean;
  battery_min_percent: number | null;
  idle_min_seconds: number | null;
};

export interface SupabaseDemoConfigProviderOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
}

function normalizeStrategyPreset(raw: string): DemoStrategyPreset {
  if (raw === 'local_first' || raw === 'balanced' || raw === 'cloud_first') {
    return raw;
  }
  throw new Error(`Unsupported strategy_preset "${raw}" in Supabase project row`);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Demo-only Supabase-backed config provider for dashboard project configs.
 * Replace with the control-plane provider in a future stage.
 */
export class SupabaseDemoConfigProvider implements ConfigProvider {
  private readonly client: SupabaseClient;

  constructor(options: SupabaseDemoConfigProviderOptions) {
    this.client = createClient(options.supabaseUrl, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  static fromEnv(): SupabaseDemoConfigProvider {
    const supabaseUrl =
      process.env.DYNO_DEMO_SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      '';
    if (!supabaseUrl) {
      throw new Error(
        'Missing Supabase URL. Set DYNO_DEMO_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).',
      );
    }

    return new SupabaseDemoConfigProvider({
      supabaseUrl,
      serviceRoleKey: requiredEnv('DYNO_DEMO_SUPABASE_SERVICE_ROLE_KEY'),
    });
  }

  async loadProjectConfig(projectId: string): Promise<DemoProjectConfig> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      throw new Error('projectId is required to load project config');
    }

    const [projectResult, configResult] = await Promise.all([
      this.client
        .from('projects')
        .select('id, use_case_type, strategy_preset')
        .eq('id', normalizedProjectId)
        .maybeSingle<ProjectRow>(),
      this.client
        .from('project_configs')
        .select(
          'project_id, local_model, cloud_model, requires_charging, wifi_only, battery_min_percent, idle_min_seconds',
        )
        .eq('project_id', normalizedProjectId)
        .maybeSingle<ProjectConfigRow>(),
    ]);

    if (projectResult.error) {
      throw new Error(`Failed to load project row from Supabase: ${projectResult.error.message}`);
    }
    if (configResult.error) {
      throw new Error(
        `Failed to load project_config row from Supabase: ${configResult.error.message}`,
      );
    }
    if (!projectResult.data) {
      throw new Error(`Project not found for projectId "${normalizedProjectId}"`);
    }
    if (!configResult.data) {
      throw new Error(`Project config not found for projectId "${normalizedProjectId}"`);
    }

    return {
      projectId: projectResult.data.id,
      use_case_type: projectResult.data.use_case_type,
      strategy_preset: normalizeStrategyPreset(projectResult.data.strategy_preset),
      local_model: configResult.data.local_model,
      cloud_model: configResult.data.cloud_model,
      requires_charging: configResult.data.requires_charging,
      wifi_only: configResult.data.wifi_only,
      battery_min_percent: configResult.data.battery_min_percent,
      idle_min_seconds: configResult.data.idle_min_seconds,
    };
  }
}
