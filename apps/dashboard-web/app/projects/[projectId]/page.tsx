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
  recordProjectRequestExecution,
  revokeProjectApiKey,
  updateProjectConfig,
  updateProjectStrategyPreset,
  updateProjectStatus,
} from '@/lib/data/dashboard-data'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { Button } from '@/components/ui/button'
import { DashboardPageHeader } from '@/components/dashboard/surface-primitives'
import { ProjectDeleteAction } from '@/app/projects/_components/project-delete-action'
import {
  ProjectConfigForm,
  type ProjectConfigFormState,
  type ProjectConfigFormValues,
} from '@/app/projects/_components/project-config-form'
import { ProjectSetupSummaryCard } from '@/app/projects/_components/project-setup-summary-card'
import { ProjectIntegrationCard } from '@/app/projects/_components/project-integration-card'
import { ProjectApiKeysCard } from '@/app/projects/_components/project-api-keys-card'
import { ProjectRecentRequestsCard } from '@/app/projects/_components/project-recent-requests-card'
import {
  ProjectRequestTesterCard,
  type ProjectRequestTesterState,
} from '@/app/projects/_components/project-request-tester-card'
import { buildProjectPageViewModel } from '@/lib/data/project-page-view-model'
import type { ProjectConfig } from '@/lib/data/dashboard-types'
import {
  getProjectRuntimeControlCapability,
  isCapabilityEditable,
} from '@/lib/data/project-capability-matrix'
import {
  ProjectMetadataItem,
  ProjectMetadataRow,
  ProjectStatusBadge,
} from '@/app/projects/_components/project-detail-primitives'

interface ProjectDetailPageProps {
  params: Promise<{
    projectId: string
  }>
}

function getLogicalModelForUseCase(useCaseType: string): string {
  return useCaseType === 'text_generation' ? 'dyno-chat-1' : 'dyno-embeddings-1'
}

function getDynoRequestEndpoint(useCaseType: string): '/embeddings' | '/chat/completions' {
  return useCaseType === 'text_generation' ? '/chat/completions' : '/embeddings'
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
      upstreamProviderType: 'openai_compatible',
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
    const batteryMinPercentEditable = isCapabilityEditable(
      getProjectRuntimeControlCapability('batteryMinPercent').state,
    )
    const idleMinSecondsEditable = isCapabilityEditable(
      getProjectRuntimeControlCapability('idleMinSeconds').state,
    )
    const requiresChargingEditable = isCapabilityEditable(
      getProjectRuntimeControlCapability('requiresCharging').state,
    )
    const wifiOnlyEditable = isCapabilityEditable(getProjectRuntimeControlCapability('wifiOnly').state)

    const parsedBatteryFromForm =
      batteryMinPercentRaw.trim() === '' ? null : Number.parseFloat(batteryMinPercentRaw)
    if (
      batteryMinPercentEditable &&
      parsedBatteryFromForm !== null &&
      (!Number.isFinite(parsedBatteryFromForm) || parsedBatteryFromForm < 0 || parsedBatteryFromForm > 100)
    ) {
      fieldErrors.batteryMinPercent = 'Enter 0-100 or leave empty.'
    }

    const parsedIdleFromForm = idleMinSecondsRaw.trim() === '' ? null : Number.parseFloat(idleMinSecondsRaw)
    if (idleMinSecondsEditable && parsedIdleFromForm !== null && (!Number.isFinite(parsedIdleFromForm) || parsedIdleFromForm < 0)) {
      fieldErrors.idleMinSeconds = 'Enter 0 or higher, or leave empty.'
    }
    const parsedBattery = batteryMinPercentEditable
      ? parsedBatteryFromForm
      : (config?.battery_min_percent ?? null)
    const parsedIdle = idleMinSecondsEditable ? parsedIdleFromForm : (config?.idle_min_seconds ?? null)
    const requiresCharging = requiresChargingEditable
      ? values.requiresCharging
      : (config?.requires_charging ?? false)
    const wifiOnly = wifiOnlyEditable ? values.wifiOnly : (config?.wifi_only ?? false)
    const normalizedValues: ProjectConfigFormValues = {
      ...values,
      batteryMinPercent: parsedBattery === null ? '' : String(parsedBattery),
      idleMinSeconds: parsedIdle === null ? '' : String(parsedIdle),
      requiresCharging,
      wifiOnly,
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
        values: normalizedValues,
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
        requires_charging: requiresCharging,
        wifi_only: wifiOnly,
      })
      if (values.strategyPreset !== resolvedProject.strategy_preset) {
        await updateProjectStrategyPreset(resolvedProject.id, values.strategyPreset)
      }
      await updateProjectStatus(resolvedProject.id, 'active')
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save configuration.',
        values: normalizedValues,
      }
    }

    revalidatePath('/projects')
    revalidatePath(`/projects/${resolvedProject.id}`)
    return {
      status: 'success',
      values: {
        ...normalizedValues,
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

  async function sendTestRequestAction(
    current: ProjectRequestTesterState,
    formData: FormData,
  ): Promise<ProjectRequestTesterState> {
    'use server'

    const dynoApiKey = String(formData.get('dynoApiKey') ?? '').trim()
    const requestInput = String(formData.get('requestInput') ?? '').trim()
    if (!dynoApiKey) {
      return {
        status: 'error',
        message: 'Dyno API key is required.',
        values: {
          requestInput: current.values.requestInput,
        },
      }
    }
    if (!requestInput) {
      return {
        status: 'error',
        message: 'Enter input text before sending a test request.',
        values: {
          requestInput,
        },
      }
    }

    const endpoint = getDynoRequestEndpoint(resolvedProject.use_case_type)
    const requestUrl = `${pageViewModel.integration.baseUrl}${endpoint}`
    const startedAt = Date.now()
    const requestBody =
      resolvedProject.use_case_type === 'text_generation'
        ? {
            model: pageViewModel.integration.logicalModel,
            messages: [{ role: 'user', content: requestInput }],
          }
        : {
            model: pageViewModel.integration.logicalModel,
            input: requestInput,
          }

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dynoApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        cache: 'no-store',
      })
      const responseText = await response.text()
      const requestId = response.headers.get('x-dyno-request-id')
      const executionPathHeader = response.headers.get('x-dyno-execution')
      const executionReasonHeader = response.headers.get('x-dyno-reason')
      let responsePreview = responseText
      let parsedMessage: string | null = null
      let parsedErrorCode: string | null = null
      let parsedErrorType: string | null = null
      try {
        const parsed = JSON.parse(responseText) as {
          error?: {
            message?: string
            code?: string
            type?: string
          }
        }
        responsePreview = JSON.stringify(parsed, null, 2)
        parsedMessage = parsed.error?.message ?? null
        parsedErrorCode = parsed.error?.code ?? null
        parsedErrorType = parsed.error?.type ?? null
      } catch {
        // Keep raw response preview when body is not JSON.
      }

      try {
        await recordProjectRequestExecution({
          projectId: resolvedProject.id,
          endpoint: `/v1${endpoint}`,
          useCase: resolvedProject.use_case_type,
          logicalModel: pageViewModel.integration.logicalModel,
          executionPath:
            executionPathHeader === 'local' || executionPathHeader === 'cloud' || executionPathHeader === 'unknown'
              ? executionPathHeader
              : response.ok
                ? 'unknown'
                : 'cloud',
          executionReason: executionReasonHeader ?? (response.ok ? 'dashboard_request_tester' : parsedErrorCode),
          status: response.ok ? 'success' : 'error',
          httpStatus: response.status,
          latencyMs: Date.now() - startedAt,
          inputCount: 1,
          errorType: response.ok ? null : parsedErrorType,
          errorCode: response.ok ? null : parsedErrorCode,
          requestId,
        })
      } catch {
        // Non-fatal: request itself succeeded/failed independently of telemetry persistence.
      }

      revalidatePath(`/projects/${resolvedProject.id}`)
      if (!response.ok) {
        return {
          status: 'error',
          httpStatus: response.status,
          message: parsedMessage ?? `Test request failed (${response.status}).`,
          responsePreview,
          values: {
            requestInput,
          },
        }
      }

      return {
        status: 'success',
        httpStatus: response.status,
        message: 'Test request succeeded. Refreshing recent request telemetry...',
        responsePreview,
        values: {
          requestInput,
        },
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to send test request.',
        values: {
          requestInput,
        },
      }
    }
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <div className="space-y-4">
        <DashboardPageHeader
          eyebrow="Project"
          title={resolvedProject.name}
          description={resolvedProject.description || 'No description provided.'}
          action={
            <div className="flex items-center gap-2">
              <ProjectDeleteAction projectName={resolvedProject.name} action={deleteProjectAction} />
              <Button asChild variant="outline" size="sm" className="border-border/60 text-xs font-medium">
                <Link href="/projects">Back to Projects</Link>
              </Button>
            </div>
          }
        >
          <p className="text-xs text-muted-foreground/75">Project detail and operational controls.</p>
          <ProjectMetadataRow className="mt-3">
            <ProjectMetadataItem
              label="Use case"
              value={
                <ProjectStatusBadge tone="neutral" className="uppercase tracking-wide">
                  {resolvedProject.use_case_type.replace(/_/g, ' ')}
                </ProjectStatusBadge>
              }
            />
            <ProjectMetadataItem
              label="Routing strategy"
              value={
                <ProjectStatusBadge tone="neutral" className="capitalize">
                  {resolvedProject.strategy_preset.replace(/_/g, ' ')}
                </ProjectStatusBadge>
              }
            />
            <ProjectMetadataItem
              label="Project status"
              value={
                <ProjectStatusBadge tone={resolvedProject.status === 'active' ? 'success' : 'neutral'} className="capitalize">
                  {resolvedProject.status}
                </ProjectStatusBadge>
              }
            />
          </ProjectMetadataRow>
        </DashboardPageHeader>

        <div className="space-y-4">
          <ProjectSetupSummaryCard summary={pageViewModel} />

          <div id="runtime-configuration">
            <ProjectConfigForm
              projectId={resolvedProject.id}
              useCaseType={resolvedProject.use_case_type}
              initialStrategyPreset={resolvedProject.strategy_preset}
              initialConfig={config}
              action={updateProjectConfigAction}
            />
          </div>

          <div id="integration">
            <ProjectIntegrationCard
              sdkSnippet={pageViewModel.integration.sdkSnippet}
              hasApiKeys={pageViewModel.health.hasApiKeys}
            />
          </div>

          <div id="api-keys">
            <ProjectApiKeysCard
              keys={apiKeys}
              activeKeyCount={pageViewModel.health.activeApiKeyCount}
              createAction={createProjectApiKeyAction}
              revokeAction={revokeProjectApiKeyAction}
            />
          </div>

          <div className="grid items-stretch gap-4 xl:grid-cols-2">
            <div id="request-tester">
              <ProjectRequestTesterCard
                useCaseType={resolvedProject.use_case_type}
                logicalModel={pageViewModel.integration.logicalModel}
                action={sendTestRequestAction}
              />
            </div>
            <div id="recent-requests">
              <ProjectRecentRequestsCard
                requests={recentRequests}
                hasRecentFailures={pageViewModel.guidance.hasRecentFailures}
                className="h-full"
              />
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  )
}
