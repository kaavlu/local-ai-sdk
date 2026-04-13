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
import { buildProjectPageViewModel } from '@/lib/data/project-page-view-model'
import type { ProjectConfig } from '@/lib/data/dashboard-types'

interface ProjectDetailPageProps {
  params: Promise<{
    projectId: string
  }>
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

  const config = await getProjectConfig(resolvedProject.id)
  const apiKeys = await listProjectApiKeys(resolvedProject.id)
  const recentRequests = await listRecentProjectRequestExecutions(resolvedProject.id, 20)
  const pageViewModel = buildProjectPageViewModel({
    project: resolvedProject,
    config,
    apiKeys,
    recentRequests,
  })

  async function updateProjectConfigAction(
    _: ProjectConfigFormState,
    formData: FormData,
  ): Promise<ProjectConfigFormState> {
    'use server'

    const localModelRaw = String(formData.get('localModel') ?? '')
    const strategyPresetRaw = String(formData.get('strategyPreset') ?? '')
    const fallbackEnabledRaw = String(formData.get('fallbackEnabled') ?? 'true')
    const logicalModelRaw = String(formData.get('logicalModel') ?? '')
    const upstreamProviderTypeRaw = String(formData.get('upstreamProviderType') ?? '')
    const upstreamBaseUrlRaw = String(formData.get('upstreamBaseUrl') ?? '')
    const upstreamModelRaw = String(formData.get('upstreamModel') ?? '')
    const upstreamApiKeyRaw = String(formData.get('upstreamApiKey') ?? '')
    const batteryMinPercentRaw = String(formData.get('batteryMinPercent') ?? '')
    const idleMinSecondsRaw = String(formData.get('idleMinSeconds') ?? '')
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
      logicalModel: logicalModelRaw,
      upstreamProviderType: upstreamProviderTypeRaw === 'openai_compatible' ? 'openai_compatible' : 'openai_compatible',
      upstreamBaseUrl: upstreamBaseUrlRaw,
      upstreamModel: upstreamModelRaw,
      upstreamApiKey: upstreamApiKeyRaw,
      localModel: localModelRaw,
      batteryMinPercent: batteryMinPercentRaw,
      idleMinSeconds: idleMinSecondsRaw,
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
    if (!values.logicalModel.trim()) {
      fieldErrors.logicalModel = 'Logical model is required.'
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
      updatedConfig = await updateProjectConfig(resolvedProject.id, {
        local_model: localModelRaw.trim() || null,
        logical_model: logicalModelRaw.trim(),
        upstream_provider_type: values.upstreamProviderType,
        upstream_base_url: upstreamBaseUrlRaw.trim() || null,
        upstream_model: upstreamModelRaw.trim() || null,
        fallback_enabled: values.fallbackEnabled,
        upstream_api_key_plaintext: upstreamApiKeyRaw.trim() || null,
        battery_min_percent: parsedBattery,
        idle_min_seconds: parsedIdle,
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground tracking-tight">{resolvedProject.name}</h1>
          {resolvedProject.description ? (
            <p className="mt-1 max-w-[640px] text-[12px] text-muted-foreground/80">{resolvedProject.description}</p>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground/65">No description provided.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProjectDeleteAction projectName={resolvedProject.name} action={deleteProjectAction} />
          <Button asChild variant="outline" className="h-[32px] rounded-sm text-[11px] font-medium">
            <Link href="/projects">Back to Projects</Link>
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-border/40 bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="rounded-sm px-1.5 text-[10px] uppercase tracking-wide">
              {resolvedProject.use_case_type.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline" className="rounded-sm border-border/50 px-1.5 text-[10px]">
              {resolvedProject.strategy_preset.replace(/_/g, ' ')}
            </Badge>
            <Badge
              variant={resolvedProject.status === 'active' ? 'default' : 'secondary'}
              className="rounded-sm px-1.5 text-[10px] capitalize"
            >
              {resolvedProject.status}
            </Badge>
          </div>
        </div>

        <ProjectSetupSummaryCard summary={pageViewModel} />

        <ProjectIntegrationCard
          baseUrl={pageViewModel.integration.baseUrl}
          logicalModel={pageViewModel.integration.logicalModel}
          openAiSnippet={pageViewModel.integration.openAiSnippet}
          curlSnippet={pageViewModel.integration.curlSnippet}
          hasApiKeys={pageViewModel.health.hasApiKeys}
        />

        <ProjectConfigForm
          projectId={resolvedProject.id}
          initialStrategyPreset={resolvedProject.strategy_preset}
          initialConfig={config}
          action={updateProjectConfigAction}
        />

        <div className="grid items-stretch gap-3 lg:grid-cols-2">
          <ProjectApiKeysCard
            keys={apiKeys}
            activeKeyCount={pageViewModel.health.activeApiKeyCount}
            createAction={createProjectApiKeyAction}
            revokeAction={revokeProjectApiKeyAction}
          />
          <ProjectRecentRequestsCard
            requests={recentRequests}
            logicalModel={pageViewModel.integration.logicalModel}
            hasRecentFailures={pageViewModel.guidance.hasRecentFailures}
            className="h-full"
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
