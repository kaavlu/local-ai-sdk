import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  createProjectApiKey,
  deleteProject,
  getProjectById,
  getProjectConfig,
  listRecentProjectRequestExecutions,
  listProjectValueSummaryExecutions,
  listProjectApiKeys,
  revokeProjectApiKey,
  updateProjectConfig,
  updateProjectStrategyPreset,
  updateProjectStatus,
} from '@/lib/data/dashboard-data'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProjectDeleteAction } from '@/app/projects/_components/project-delete-action'
import {
  ProjectConfigForm,
  type ProjectConfigFormState,
  type ProjectConfigFormValues,
} from '@/app/projects/_components/project-config-form'
import { ProjectIntegrationCard } from '@/app/projects/_components/project-integration-card'
import { ProjectApiKeysCard } from '@/app/projects/_components/project-api-keys-card'
import { ProjectRecentRequestsCard } from '@/app/projects/_components/project-recent-requests-card'
import { ProjectSetupSummaryCard } from '@/app/projects/_components/project-setup-summary-card'
import { ProjectValueSummaryCard } from '@/app/projects/_components/project-value-summary-card'
import { buildProjectPageViewModel } from '@/lib/data/project-page-view-model'
import type { ProjectConfig } from '@/lib/data/dashboard-types'

interface ProjectDetailPageProps {
  params: Promise<{
    projectId: string
  }>
}

function getLogicalModelForUseCase(useCaseType: string): string {
  return useCaseType === 'text_generation' ? 'dyno-chat-1' : 'dyno-embeddings-1'
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  const { projectId } = await params
  const project = await getProjectById(projectId)

  if (!project) {
    notFound()
  }
  const resolvedProject = project

  const [config, apiKeys, recentRequests, valueSummaryExecutions] = await Promise.all([
    getProjectConfig(resolvedProject.id),
    listProjectApiKeys(resolvedProject.id),
    listRecentProjectRequestExecutions(resolvedProject.id, 20),
    listProjectValueSummaryExecutions(resolvedProject.id, 7),
  ])
  const pageViewModel = buildProjectPageViewModel({
    project: resolvedProject,
    config,
    apiKeys,
    recentRequests,
    valueSummaryExecutions,
  })

  async function updateProjectConfigAction(
    _: ProjectConfigFormState,
    formData: FormData,
  ): Promise<ProjectConfigFormState> {
    'use server'

    const localModelRaw = String(formData.get('localModel') ?? '')
    const strategyPresetRaw = String(formData.get('strategyPreset') ?? '')
    const fallbackEnabledRaw = String(formData.get('fallbackEnabled') ?? 'true')
    const upstreamProviderTypeRaw = String(formData.get('upstreamProviderType') ?? '')
    const upstreamBaseUrlRaw = String(formData.get('upstreamBaseUrl') ?? '')
    const upstreamModelRaw = String(formData.get('upstreamModel') ?? '')
    const upstreamApiKeyRaw = String(formData.get('upstreamApiKey') ?? '')
    const batteryMinPercentRaw = String(formData.get('batteryMinPercent') ?? '')
    const idleMinSecondsRaw = String(formData.get('idleMinSeconds') ?? '')
    const estimatedCloudCostPerRequestUsdRaw = String(
      formData.get('estimatedCloudCostPerRequestUsd') ?? '',
    )
    const requiresChargingRaw = String(formData.get('requiresCharging') ?? 'false')
    const wifiOnlyRaw = String(formData.get('wifiOnly') ?? 'false')

    const values: ProjectConfigFormValues = {
      strategyPreset:
        strategyPresetRaw === 'local_first' ||
        strategyPresetRaw === 'balanced' ||
        strategyPresetRaw === 'cloud_first'
          ? strategyPresetRaw
          : resolvedProject.strategy_preset,
      fallbackEnabled: fallbackEnabledRaw === 'true',
      upstreamProviderType: upstreamProviderTypeRaw === 'openai_compatible' ? 'openai_compatible' : 'openai_compatible',
      upstreamBaseUrl: upstreamBaseUrlRaw,
      upstreamModel: upstreamModelRaw,
      upstreamApiKey: upstreamApiKeyRaw,
      localModel: localModelRaw,
      batteryMinPercent: batteryMinPercentRaw,
      idleMinSeconds: idleMinSecondsRaw,
      estimatedCloudCostPerRequestUsd: estimatedCloudCostPerRequestUsdRaw,
      requiresCharging: requiresChargingRaw === 'true',
      wifiOnly: wifiOnlyRaw === 'true',
    }

    const fieldErrors: ProjectConfigFormState['fieldErrors'] = {}

    const parsedBattery =
      batteryMinPercentRaw.trim() === '' ? null : Number.parseFloat(batteryMinPercentRaw)
    if (parsedBattery !== null && (!Number.isFinite(parsedBattery) || parsedBattery < 0 || parsedBattery > 100)) {
      fieldErrors.batteryMinPercent = 'Enter 0-100 or leave empty.'
    }

    const parsedIdle = idleMinSecondsRaw.trim() === '' ? null : Number.parseFloat(idleMinSecondsRaw)
    if (parsedIdle !== null && (!Number.isFinite(parsedIdle) || parsedIdle < 0)) {
      fieldErrors.idleMinSeconds = 'Enter 0 or higher, or leave empty.'
    }
    const parsedEstimatedCloudCostPerRequestUsd =
      estimatedCloudCostPerRequestUsdRaw.trim() === ''
        ? null
        : Number.parseFloat(estimatedCloudCostPerRequestUsdRaw)
    if (
      parsedEstimatedCloudCostPerRequestUsd !== null &&
      (!Number.isFinite(parsedEstimatedCloudCostPerRequestUsd) ||
        parsedEstimatedCloudCostPerRequestUsd < 0)
    ) {
      fieldErrors.estimatedCloudCostPerRequestUsd = 'Enter 0 or higher, or leave empty.'
    }
    if (!values.upstreamProviderType) {
      fieldErrors.upstreamProviderType = 'Upstream provider type is required.'
    }
    if (values.fallbackEnabled) {
      const baseUrl = values.upstreamBaseUrl.trim()
      if (!baseUrl) {
        fieldErrors.upstreamBaseUrl = 'Upstream base URL is required when fallback is enabled.'
      } else {
        try {
          const parsed = new URL(baseUrl)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            fieldErrors.upstreamBaseUrl = 'Upstream base URL must start with http:// or https://.'
          }
        } catch {
          fieldErrors.upstreamBaseUrl = 'Upstream base URL must be a valid URL.'
        }
      }

      if (!values.upstreamModel.trim()) {
        fieldErrors.upstreamModel = 'Upstream model is required when fallback is enabled.'
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        status: 'error',
        fieldErrors,
        values,
      }
    }

    let updatedConfig: ProjectConfig | null = null
    try {
      const logicalModel = getLogicalModelForUseCase(resolvedProject.use_case_type)
      updatedConfig = await updateProjectConfig(resolvedProject.id, {
        local_model: localModelRaw.trim() || null,
        logical_model: logicalModel,
        upstream_provider_type: values.upstreamProviderType,
        upstream_base_url: upstreamBaseUrlRaw.trim() || null,
        upstream_model: upstreamModelRaw.trim() || null,
        fallback_enabled: values.fallbackEnabled,
        upstream_api_key_plaintext: upstreamApiKeyRaw.trim() || null,
        battery_min_percent: parsedBattery,
        idle_min_seconds: parsedIdle,
        estimated_cloud_cost_per_request_usd: parsedEstimatedCloudCostPerRequestUsd,
        requires_charging: values.requiresCharging,
        wifi_only: values.wifiOnly,
      })
      if (values.strategyPreset !== resolvedProject.strategy_preset) {
        await updateProjectStrategyPreset(resolvedProject.id, values.strategyPreset)
      }
      await updateProjectStatus(resolvedProject.id, 'active')
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save configuration.',
        values,
      }
    }

    revalidatePath('/projects')
    revalidatePath(`/projects/${resolvedProject.id}`)
    return {
      status: 'success',
      values: {
        ...values,
        upstreamApiKey: '',
      },
      apiKeyConfigured: updatedConfig?.upstream_api_key_configured ?? false,
      apiKeyLastUpdatedAt: updatedConfig?.upstream_api_key_last_updated_at ?? null,
    }
  }

  async function deleteProjectAction(_: { status: 'idle' | 'error'; message?: string }) {
    'use server'

    try {
      await deleteProject(resolvedProject.id)
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Failed to delete project.',
      }
    }

    redirect('/projects')
  }

  async function createProjectApiKeyAction(
    _: { status: 'idle' | 'success' | 'error'; message?: string; createdKey?: string },
    formData: FormData,
  ) {
    'use server'

    const label = String(formData.get('label') ?? '')
    try {
      const created = await createProjectApiKey(resolvedProject.id, label)
      revalidatePath(`/projects/${resolvedProject.id}`)
      return {
        status: 'success' as const,
        createdKey: created.apiKey,
      }
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Failed to create API key.',
      }
    }
  }

  async function revokeProjectApiKeyAction(
    _: { status: 'idle' | 'success' | 'error'; message?: string },
    formData: FormData,
  ) {
    'use server'

    const keyId = String(formData.get('keyId') ?? '')
    if (!keyId) {
      return {
        status: 'error' as const,
        message: 'Missing API key id.',
      }
    }
    try {
      await revokeProjectApiKey(resolvedProject.id, keyId)
      revalidatePath(`/projects/${resolvedProject.id}`)
      return {
        status: 'success' as const,
      }
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Failed to revoke API key.',
      }
    }
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <div className="space-y-4">
        <section className="rounded-xl border border-border/55 bg-card/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">Project</p>
              <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-foreground">{resolvedProject.name}</h1>
              {resolvedProject.description ? (
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground/85">
                  {resolvedProject.description}
                </p>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground/65">No description provided.</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ProjectDeleteAction projectName={resolvedProject.name} action={deleteProjectAction} />
              <Button asChild variant="outline" className="h-8 rounded-md border-border/60 px-3 text-[11px] font-medium">
                <Link href="/projects">Back to Projects</Link>
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/45 bg-background/35 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Use case</p>
              <Badge variant="secondary" className="mt-1 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {resolvedProject.use_case_type.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="rounded-lg border border-border/45 bg-background/35 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Routing strategy</p>
              <Badge variant="outline" className="mt-1 rounded-md border-border/55 px-2 py-0.5 text-[10px] capitalize">
                {resolvedProject.strategy_preset.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="rounded-lg border border-border/45 bg-background/35 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Project status</p>
              <Badge
                variant={resolvedProject.status === 'active' ? 'default' : 'secondary'}
                className="mt-1 rounded-md px-2 py-0.5 text-[10px] capitalize"
              >
                {resolvedProject.status}
              </Badge>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <ProjectConfigForm
            projectId={resolvedProject.id}
            useCaseType={resolvedProject.use_case_type}
            initialStrategyPreset={resolvedProject.strategy_preset}
            initialConfig={config}
            action={updateProjectConfigAction}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <ProjectSetupSummaryCard summary={pageViewModel} />
            <ProjectValueSummaryCard summary={pageViewModel} />
          </div>

          <ProjectIntegrationCard
            baseUrl={pageViewModel.integration.baseUrl}
            openAiSnippet={pageViewModel.integration.openAiSnippet}
            curlSnippet={pageViewModel.integration.curlSnippet}
            hasApiKeys={pageViewModel.health.hasApiKeys}
          />

          <div className="grid items-stretch gap-4 xl:grid-cols-2">
            <ProjectApiKeysCard
              keys={apiKeys}
              activeKeyCount={pageViewModel.health.activeApiKeyCount}
              createAction={createProjectApiKeyAction}
              revokeAction={revokeProjectApiKeyAction}
            />
            <ProjectRecentRequestsCard
              requests={recentRequests}
              hasRecentFailures={pageViewModel.guidance.hasRecentFailures}
              className="h-full"
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
