'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type {
  ProjectConfig,
  StrategyPreset,
  UpstreamProviderType,
  UseCaseType,
} from '@/lib/data/dashboard-types'
import {
  getProjectRuntimeControlCapability,
  isCapabilityEditable,
} from '@/lib/data/project-capability-matrix'
import {
  ProjectInlineAlert,
  ProjectInsetPanel,
  ProjectSectionShell,
  ProjectStatusBadge,
} from '@/app/projects/_components/project-detail-primitives'

export type ProjectConfigFormValues = {
  strategyPreset: StrategyPreset
  fallbackEnabled: boolean
  upstreamProviderType: UpstreamProviderType
  upstreamBaseUrl: string
  upstreamModel: string
  upstreamApiKey: string
  localModel: string
  batteryMinPercent: string
  idleMinSeconds: string
  estimatedCloudCostPerRequestUsd: string
  requiresCharging: boolean
  wifiOnly: boolean
}

export type ProjectConfigFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: {
    strategyPreset?: string
    upstreamProviderType?: string
    upstreamBaseUrl?: string
    upstreamModel?: string
    upstreamApiKey?: string
    batteryMinPercent?: string
    idleMinSeconds?: string
    estimatedCloudCostPerRequestUsd?: string
  }
  values?: ProjectConfigFormValues
  apiKeyConfigured?: boolean
  apiKeyLastUpdatedAt?: string | null
}

const initialState: ProjectConfigFormState = {
  status: 'idle',
}

type CloudProviderProfile = 'openai_compatible' | 'gemini' | 'custom'

function getDefaultUpstreamModelPlaceholder(useCaseType: UseCaseType): string {
  return useCaseType === 'text_generation' ? 'gpt-4.1-mini' : 'text-embedding-3-small'
}

function getDefaultUpstreamModelForProvider(
  useCaseType: UseCaseType,
  provider: CloudProviderProfile,
): string {
  if (provider === 'gemini') {
    return useCaseType === 'text_generation' ? 'gemini-2.0-flash' : 'text-embedding-004'
  }
  return getDefaultUpstreamModelPlaceholder(useCaseType)
}

function inferCloudProviderProfile(baseUrl: string): CloudProviderProfile {
  const normalized = baseUrl.trim().toLowerCase()
  if (!normalized || normalized.includes('api.openai.com')) {
    return 'openai_compatible'
  }
  if (normalized.includes('generativelanguage.googleapis.com') || normalized.includes('gemini')) {
    return 'gemini'
  }
  return 'custom'
}

function getCloudProviderLabel(provider: CloudProviderProfile): string {
  if (provider === 'gemini') return 'Gemini'
  if (provider === 'custom') return 'Custom'
  return 'OpenAI'
}

function formatOptionalNumber(value: string, emptyLabel: string, suffix: string): string {
  if (!value.trim()) return emptyLabel
  return `${value.trim()}${suffix}`
}

function toFormValues(
  config: ProjectConfig | null,
  strategyPreset: StrategyPreset,
  useCaseType: UseCaseType,
): ProjectConfigFormValues {
  return {
    strategyPreset,
    fallbackEnabled: config?.fallback_enabled ?? true,
    upstreamProviderType: config?.upstream_provider_type ?? 'openai_compatible',
    upstreamBaseUrl: config?.upstream_base_url ?? '',
    upstreamModel: config?.upstream_model ?? config?.cloud_model ?? '',
    upstreamApiKey: '',
    localModel: config?.local_model ?? '',
    batteryMinPercent:
      config?.battery_min_percent === null || config?.battery_min_percent === undefined
        ? ''
        : String(config.battery_min_percent),
    idleMinSeconds:
      config?.idle_min_seconds === null || config?.idle_min_seconds === undefined
        ? ''
        : String(config.idle_min_seconds),
    estimatedCloudCostPerRequestUsd:
      config?.estimated_cloud_cost_per_request_usd === null ||
      config?.estimated_cloud_cost_per_request_usd === undefined
        ? ''
        : String(config.estimated_cloud_cost_per_request_usd),
    requiresCharging: config?.requires_charging ?? false,
    wifiOnly: config?.wifi_only ?? false,
  }
}

function getClientFieldErrors(
  values: ProjectConfigFormValues,
  apiKeyConfigured: boolean,
  options: {
    batteryMinPercentEditable: boolean
    idleMinSecondsEditable: boolean
  },
) {
  const errors: ProjectConfigFormState['fieldErrors'] = {}

  if (!values.upstreamProviderType) {
    errors.upstreamProviderType = 'Upstream provider is required.'
  }
  if (values.fallbackEnabled) {
    if (!values.upstreamBaseUrl.trim()) {
      errors.upstreamBaseUrl = 'Upstream base URL is required when fallback is enabled.'
    } else {
      try {
        const parsed = new URL(values.upstreamBaseUrl.trim())
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.upstreamBaseUrl = 'Upstream base URL must start with http:// or https://.'
        }
      } catch {
        errors.upstreamBaseUrl = 'Upstream base URL must be a valid URL.'
      }
    }

    if (!values.upstreamModel.trim()) {
      errors.upstreamModel = 'Upstream model is required when fallback is enabled.'
    }
  }

  if (options.batteryMinPercentEditable && values.batteryMinPercent !== '') {
    const parsed = Number(values.batteryMinPercent)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      errors.batteryMinPercent = 'Enter 0-100 or leave empty.'
    }
  }

  if (options.idleMinSecondsEditable && values.idleMinSeconds !== '') {
    const parsed = Number(values.idleMinSeconds)
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.idleMinSeconds = 'Enter 0 or higher, or leave empty.'
    }
  }

  if (values.estimatedCloudCostPerRequestUsd !== '') {
    const parsed = Number(values.estimatedCloudCostPerRequestUsd)
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.estimatedCloudCostPerRequestUsd = 'Enter 0 or higher, or leave empty.'
    }
  }

  return errors
}

interface ProjectConfigFormProps {
  projectId: string
  useCaseType: UseCaseType
  initialStrategyPreset: StrategyPreset
  initialConfig: ProjectConfig | null
  action: (
    state: ProjectConfigFormState,
    formData: FormData,
  ) => Promise<ProjectConfigFormState>
}

export function ProjectConfigForm({
  projectId,
  useCaseType,
  initialStrategyPreset,
  initialConfig,
  action,
}: ProjectConfigFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [showCloudDialog, setShowCloudDialog] = useState(false)
  const [showLocalDialog, setShowLocalDialog] = useState(false)
  const [showConditionsDialog, setShowConditionsDialog] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [values, setValues] = useState<ProjectConfigFormValues>(() =>
    toFormValues(initialConfig, initialStrategyPreset, useCaseType),
  )
  const [lastSavedValues, setLastSavedValues] = useState<ProjectConfigFormValues>(() =>
    toFormValues(initialConfig, initialStrategyPreset, useCaseType),
  )
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(
    initialConfig?.upstream_api_key_configured ?? false,
  )
  const [apiKeyLastUpdatedAt, setApiKeyLastUpdatedAt] = useState<string | null>(
    initialConfig?.upstream_api_key_last_updated_at ?? null,
  )
  const [cloudProviderProfile, setCloudProviderProfile] = useState<CloudProviderProfile>(() =>
    inferCloudProviderProfile(initialConfig?.upstream_base_url ?? ''),
  )

  useEffect(() => {
    if (state.values) {
      setValues(state.values)
    }

    if (state.status === 'success' && state.values) {
      setLastSavedValues(state.values)
      if (typeof state.apiKeyConfigured === 'boolean') {
        setApiKeyConfigured(state.apiKeyConfigured)
      }
      if (state.apiKeyLastUpdatedAt !== undefined) {
        setApiKeyLastUpdatedAt(state.apiKeyLastUpdatedAt ?? null)
      }
    }
  }, [state.apiKeyConfigured, state.apiKeyLastUpdatedAt, state.status, state.values])

  const clientFieldErrors = useMemo(
    () =>
      getClientFieldErrors(values, apiKeyConfigured, {
        batteryMinPercentEditable: isCapabilityEditable(
          getProjectRuntimeControlCapability('batteryMinPercent').state,
        ),
        idleMinSecondsEditable: isCapabilityEditable(
          getProjectRuntimeControlCapability('idleMinSeconds').state,
        ),
      }),
    [apiKeyConfigured, values],
  )
  const hasClientErrors = Object.keys(clientFieldErrors).length > 0
  const inferredProviderProfile = useMemo(
    () => inferCloudProviderProfile(values.upstreamBaseUrl),
    [values.upstreamBaseUrl],
  )

  useEffect(() => {
    setCloudProviderProfile(inferredProviderProfile)
  }, [inferredProviderProfile])

  const isDirty = useMemo(() => {
    return (
      values.strategyPreset !== lastSavedValues.strategyPreset ||
      values.fallbackEnabled !== lastSavedValues.fallbackEnabled ||
      values.upstreamProviderType !== lastSavedValues.upstreamProviderType ||
      values.upstreamBaseUrl !== lastSavedValues.upstreamBaseUrl ||
      values.upstreamModel !== lastSavedValues.upstreamModel ||
      values.upstreamApiKey !== '' ||
      values.localModel !== lastSavedValues.localModel ||
      values.batteryMinPercent !== lastSavedValues.batteryMinPercent ||
      values.idleMinSeconds !== lastSavedValues.idleMinSeconds ||
      values.estimatedCloudCostPerRequestUsd !== lastSavedValues.estimatedCloudCostPerRequestUsd ||
      values.requiresCharging !== lastSavedValues.requiresCharging ||
      values.wifiOnly !== lastSavedValues.wifiOnly
    )
  }, [lastSavedValues, values])

  const batteryError = clientFieldErrors.batteryMinPercent ?? state.fieldErrors?.batteryMinPercent
  const idleError = clientFieldErrors.idleMinSeconds ?? state.fieldErrors?.idleMinSeconds
  const estimatedCloudCostPerRequestUsdError =
    clientFieldErrors.estimatedCloudCostPerRequestUsd ??
    state.fieldErrors?.estimatedCloudCostPerRequestUsd
  const upstreamProviderError =
    clientFieldErrors.upstreamProviderType ?? state.fieldErrors?.upstreamProviderType
  const upstreamBaseUrlError = clientFieldErrors.upstreamBaseUrl ?? state.fieldErrors?.upstreamBaseUrl
  const upstreamModelError = clientFieldErrors.upstreamModel ?? state.fieldErrors?.upstreamModel
  const upstreamApiKeyError = clientFieldErrors.upstreamApiKey ?? state.fieldErrors?.upstreamApiKey
  const strategyError = state.fieldErrors?.strategyPreset
  const cloudProviderLabel = getCloudProviderLabel(cloudProviderProfile)
  const cloudConnected =
    values.fallbackEnabled &&
    values.upstreamBaseUrl.trim().length > 0 &&
    values.upstreamModel.trim().length > 0
  const localEnabled = values.localModel.trim().length > 0
  const batteryMinPercentCapability = getProjectRuntimeControlCapability('batteryMinPercent')
  const idleMinSecondsCapability = getProjectRuntimeControlCapability('idleMinSeconds')
  const wifiOnlyCapability = getProjectRuntimeControlCapability('wifiOnly')
  const requiresChargingCapability = getProjectRuntimeControlCapability('requiresCharging')
  const batteryMinPercentEditable = isCapabilityEditable(batteryMinPercentCapability.state)
  const idleMinSecondsEditable = isCapabilityEditable(idleMinSecondsCapability.state)
  const wifiOnlyEditable = isCapabilityEditable(wifiOnlyCapability.state)
  const requiresChargingEditable = isCapabilityEditable(requiresChargingCapability.state)
  const hasEditableRunConditions =
    batteryMinPercentEditable || idleMinSecondsEditable || wifiOnlyEditable || requiresChargingEditable

  const selectCloudProviderProfile = (provider: CloudProviderProfile) => {
    setCloudProviderProfile(provider)
    setValues((previous) => {
      const next: ProjectConfigFormValues = {
        ...previous,
        upstreamProviderType: 'openai_compatible',
      }
      const openAiUrl = 'https://api.openai.com'
      const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai'
      if (provider === 'openai_compatible') {
        if (!previous.upstreamBaseUrl.trim() || inferCloudProviderProfile(previous.upstreamBaseUrl) !== 'openai_compatible') {
          next.upstreamBaseUrl = openAiUrl
        }
      } else if (provider === 'gemini') {
        if (!previous.upstreamBaseUrl.trim() || inferCloudProviderProfile(previous.upstreamBaseUrl) !== 'gemini') {
          next.upstreamBaseUrl = geminiUrl
        }
      }
      if (!previous.upstreamModel.trim()) {
        next.upstreamModel = getDefaultUpstreamModelForProvider(useCaseType, provider)
      }
      return next
    })
  }

  return (
    <ProjectSectionShell
      title="Runtime Configuration"
      description="Configure fallback behavior, model mapping, and execution safeguards."
      action={
        state.status === 'success' && !isDirty ? (
          <ProjectStatusBadge tone="success">Saved</ProjectStatusBadge>
        ) : state.status === 'error' && state.message ? (
          <ProjectStatusBadge tone="error">Save failed</ProjectStatusBadge>
        ) : (
          <ProjectStatusBadge tone="neutral">Draft</ProjectStatusBadge>
        )
      }
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="strategyPreset" value={values.strategyPreset} />
        <input type="hidden" name="fallbackEnabled" value={values.fallbackEnabled ? 'true' : 'false'} />
        <input type="hidden" name="upstreamProviderType" value={values.upstreamProviderType} />
        <input type="hidden" name="upstreamBaseUrl" value={values.upstreamBaseUrl} />
        <input type="hidden" name="upstreamModel" value={values.upstreamModel} />
        <input type="hidden" name="upstreamApiKey" value={values.upstreamApiKey} />
        <input type="hidden" name="localModel" value={values.localModel} />
        <input type="hidden" name="batteryMinPercent" value={values.batteryMinPercent} />
        <input type="hidden" name="idleMinSeconds" value={values.idleMinSeconds} />
        <input
          type="hidden"
          name="estimatedCloudCostPerRequestUsd"
          value={values.estimatedCloudCostPerRequestUsd}
        />
        <input type="hidden" name="requiresCharging" value={values.requiresCharging ? 'true' : 'false'} />
        <input type="hidden" name="wifiOnly" value={values.wifiOnly ? 'true' : 'false'} />

        <ProjectInsetPanel>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-preset" className="text-[11px] font-medium text-foreground/90">
              Runtime behavior
            </Label>
            <Select
              value={values.strategyPreset}
              onValueChange={(value) =>
                setValues((previous) => ({
                  ...previous,
                  strategyPreset: value as StrategyPreset,
                }))
              }
              disabled={isPending}
            >
              <SelectTrigger
                id="strategy-preset"
                className="h-8 w-full rounded-md border-border/60 bg-background/60 px-2.5 text-[12px]"
              >
                <SelectValue placeholder="Select strategy preset" />
              </SelectTrigger>
              <SelectContent className="border-border/60 bg-card">
                <SelectItem value="local_first" className="text-[12px]">
                  Local first
                </SelectItem>
                <SelectItem value="balanced" className="text-[12px]">
                  Balanced
                </SelectItem>
                <SelectItem value="cloud_first" className="text-[12px]">
                  Cloud first
                </SelectItem>
              </SelectContent>
            </Select>
            {strategyError ? <p className="text-[11px] text-destructive">{strategyError}</p> : null}
          </div>
        </ProjectInsetPanel>

        <div className="grid gap-3 sm:grid-cols-2">
          <ProjectInsetPanel>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium text-foreground/90">Cloud target</p>
                <p className="text-[10px] text-muted-foreground/70">
                  {cloudConnected ? 'Connected' : 'Not connected'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-7 rounded-md border-border/55 px-2.5 text-[10px]"
                onClick={() => setShowCloudDialog(true)}
                disabled={isPending}
              >
                Configure cloud
              </Button>
            </div>
            <div className="space-y-0.5 text-[11px]">
              <p className="text-muted-foreground/80">Provider: {cloudProviderLabel}</p>
              <p className="text-muted-foreground/80">
                Model: {values.upstreamModel.trim() || 'Not configured'}
              </p>
            </div>
          </ProjectInsetPanel>

          <ProjectInsetPanel>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium text-foreground/90">Local target</p>
                <p className="text-[10px] text-muted-foreground/70">{localEnabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-7 rounded-md border-border/55 px-2.5 text-[10px]"
                onClick={() => setShowLocalDialog(true)}
                disabled={isPending}
              >
                Configure local
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/80">
              Model: {values.localModel.trim() || 'Not configured'}
            </p>
          </ProjectInsetPanel>
        </div>

        <ProjectInsetPanel>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-foreground/90">Run conditions</p>
            <Button
              type="button"
              variant="outline"
              className="h-7 rounded-md border-border/55 px-2.5 text-[10px]"
              onClick={() => setShowConditionsDialog(true)}
              disabled={isPending}
            >
              Edit conditions
            </Button>
          </div>
          <div className="grid gap-1 text-[11px] text-muted-foreground/80 sm:grid-cols-2">
            <p>Battery min: {formatOptionalNumber(values.batteryMinPercent, 'None', '%')}</p>
            <p>Idle min: {formatOptionalNumber(values.idleMinSeconds, 'None', 's')}</p>
            <p>Wi-Fi only: {values.wifiOnly ? 'Yes' : 'No'}</p>
            <p>Requires charging: {values.requiresCharging ? 'Yes' : 'No'}</p>
          </div>
          {!hasEditableRunConditions ? (
            <p className="mt-2 text-[10px] text-muted-foreground/80">
              Run-condition controls are visible for transparency, but currently not enforced by the default
              SDK runtime path.
            </p>
          ) : null}
        </ProjectInsetPanel>

        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <ProjectInsetPanel>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium text-foreground/90">Advanced configuration</p>
                <p className="text-[10px] text-muted-foreground/70">
                  Full control over routing and runtime fields.
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="h-7 rounded-md border-border/55 px-2.5 text-[10px]">
                  {showAdvanced ? 'Hide advanced' : 'Show advanced'}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="mt-3 space-y-3">
              <ProjectInsetPanel className="p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Routing
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">Strategy preset</Label>
                    <Select
                      value={values.strategyPreset}
                      onValueChange={(value) =>
                        setValues((previous) => ({ ...previous, strategyPreset: value as StrategyPreset }))
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="h-8 w-full rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]">
                        <SelectValue placeholder="Select strategy preset" />
                      </SelectTrigger>
                      <SelectContent className="border-border/60 bg-card">
                        <SelectItem value="local_first" className="text-[12px]">
                          Local first
                        </SelectItem>
                        <SelectItem value="balanced" className="text-[12px]">
                          Balanced
                        </SelectItem>
                        <SelectItem value="cloud_first" className="text-[12px]">
                          Cloud first
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
                    <div>
                      <p className="text-[11px] font-medium text-foreground/90">Fallback enabled</p>
                      <p className="text-[10px] text-muted-foreground/70">
                        Route to cloud upstream when local is unavailable.
                      </p>
                    </div>
                    <Switch
                      checked={values.fallbackEnabled}
                      onCheckedChange={(checked) =>
                        setValues((previous) => ({ ...previous, fallbackEnabled: checked }))
                      }
                      disabled={isPending}
                      aria-label="Fallback enabled"
                    />
                  </div>
                </div>
              </ProjectInsetPanel>

              <ProjectInsetPanel className="p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Cloud
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">Upstream provider</Label>
                    <Select
                      value={values.upstreamProviderType}
                      onValueChange={(value) =>
                        setValues((previous) => ({
                          ...previous,
                          upstreamProviderType: value as UpstreamProviderType,
                        }))
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="h-8 w-full rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent className="border-border/60 bg-card">
                        <SelectItem value="openai_compatible" className="text-[12px]">
                          OpenAI
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {upstreamProviderError ? (
                      <p className="text-[11px] text-destructive">{upstreamProviderError}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">Upstream base URL</Label>
                    <Input
                      value={values.upstreamBaseUrl}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, upstreamBaseUrl: event.target.value }))
                      }
                      placeholder="https://api.openai.com"
                      className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                      disabled={isPending}
                    />
                    {upstreamBaseUrlError ? (
                      <p className="text-[11px] text-destructive">{upstreamBaseUrlError}</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">Upstream model</Label>
                    <Input
                      value={values.upstreamModel}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, upstreamModel: event.target.value }))
                      }
                      placeholder={getDefaultUpstreamModelPlaceholder(useCaseType)}
                      className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                      disabled={isPending}
                    />
                    {upstreamModelError ? <p className="text-[11px] text-destructive">{upstreamModelError}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">
                      Upstream API key (optional hosted relay)
                    </Label>
                    <Input
                      type="password"
                      value={values.upstreamApiKey}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, upstreamApiKey: event.target.value }))
                      }
                      placeholder={apiKeyConfigured ? 'Enter new key to rotate' : 'Leave empty for app-owned fallback'}
                      className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                      disabled={isPending}
                      autoComplete="off"
                    />
                    <p className="text-[10px] text-muted-foreground/75">
                      Optional non-default relay path. Canonical SDK fallback keeps provider credentials in app code.
                    </p>
                    {upstreamApiKeyError ? <p className="text-[11px] text-destructive">{upstreamApiKeyError}</p> : null}
                  </div>
                </div>
              </ProjectInsetPanel>

              <ProjectInsetPanel className="p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Local
                </p>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-foreground/90">Local model</Label>
                  <Input
                    value={values.localModel}
                    onChange={(event) =>
                      setValues((previous) => ({ ...previous, localModel: event.target.value }))
                    }
                    placeholder="Xenova/all-MiniLM-L6-v2"
                    className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                    disabled={isPending}
                    autoComplete="off"
                  />
                </div>
              </ProjectInsetPanel>

              <ProjectInsetPanel className="p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Runtime constraints
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">Battery min percent</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={values.batteryMinPercent}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, batteryMinPercent: event.target.value }))
                      }
                      placeholder="20"
                      className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                      disabled={isPending || !batteryMinPercentEditable}
                    />
                    {batteryError ? <p className="text-[11px] text-destructive">{batteryError}</p> : null}
                    {!batteryMinPercentEditable ? (
                      <p className="text-[10px] text-muted-foreground/75">{batteryMinPercentCapability.note}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">Idle min seconds</Label>
                    <Input
                      type="number"
                      min={0}
                      value={values.idleMinSeconds}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, idleMinSeconds: event.target.value }))
                      }
                      placeholder="30"
                      className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                      disabled={isPending || !idleMinSecondsEditable}
                    />
                    {idleError ? <p className="text-[11px] text-destructive">{idleError}</p> : null}
                    {!idleMinSecondsEditable ? (
                      <p className="text-[10px] text-muted-foreground/75">{idleMinSecondsCapability.note}</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
                    <div>
                      <p className="text-[11px] font-medium text-foreground/90">Wi-Fi only</p>
                      <p className="text-[10px] text-muted-foreground/70">Prevent cellular network execution.</p>
                    </div>
                    <Switch
                      checked={values.wifiOnly}
                      onCheckedChange={(checked) =>
                        setValues((previous) => ({ ...previous, wifiOnly: checked }))
                      }
                      disabled={isPending || !wifiOnlyEditable}
                      aria-label="Wi-Fi only"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
                    <div>
                      <p className="text-[11px] font-medium text-foreground/90">Requires charging</p>
                      <p className="text-[10px] text-muted-foreground/70">Allow runs only while charging.</p>
                    </div>
                    <Switch
                      checked={values.requiresCharging}
                      onCheckedChange={(checked) =>
                        setValues((previous) => ({ ...previous, requiresCharging: checked }))
                      }
                      disabled={isPending || !requiresChargingEditable}
                      aria-label="Requires charging"
                    />
                  </div>
                </div>
                {!wifiOnlyEditable || !requiresChargingEditable ? (
                  <p className="mt-2 text-[10px] text-muted-foreground/75">
                    {wifiOnlyCapability.note}
                  </p>
                ) : null}
              </ProjectInsetPanel>

              <ProjectInsetPanel className="p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Metadata / labeling
                </p>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-foreground/90">
                    Estimated cloud cost per request (USD)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    value={values.estimatedCloudCostPerRequestUsd}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        estimatedCloudCostPerRequestUsd: event.target.value,
                      }))
                    }
                    placeholder="0.0001"
                    className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                    disabled={isPending}
                  />
                  <p className="text-[10px] text-muted-foreground/75">
                    Used for value estimates only. This does not represent exact provider billing.
                  </p>
                  {estimatedCloudCostPerRequestUsdError ? (
                    <p className="text-[11px] text-destructive">{estimatedCloudCostPerRequestUsdError}</p>
                  ) : null}
                </div>
              </ProjectInsetPanel>
            </CollapsibleContent>
          </ProjectInsetPanel>
        </Collapsible>

        <Dialog open={showCloudDialog} onOpenChange={setShowCloudDialog}>
          <DialogContent
            showCloseButton={!isPending}
            className="max-w-lg gap-3 border-border/50 bg-card p-4 sm:max-w-lg"
          >
            <DialogHeader className="gap-1">
              <DialogTitle className="text-[13px] font-semibold tracking-tight">Configure cloud</DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground/75">
                Set provider and model defaults. App-owned fallback credentials are the canonical path.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-foreground/90">Cloud provider</Label>
                <Select
                  value={cloudProviderProfile}
                  onValueChange={(value) => selectCloudProviderProfile(value as CloudProviderProfile)}
                  disabled={isPending}
                >
                  <SelectTrigger className="h-8 w-full rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]">
                    <SelectValue placeholder="Select provider profile" />
                  </SelectTrigger>
                  <SelectContent className="border-border/60 bg-card">
                    <SelectItem value="openai_compatible" className="text-[12px]">
                      OpenAI
                    </SelectItem>
                    <SelectItem value="gemini" className="text-[12px]">
                      Gemini
                    </SelectItem>
                    <SelectItem value="custom" className="text-[12px]">
                      Custom
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-foreground/90">Upstream model</Label>
                <Input
                  value={values.upstreamModel}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, upstreamModel: event.target.value }))
                  }
                  placeholder={getDefaultUpstreamModelForProvider(useCaseType, cloudProviderProfile)}
                  className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                  disabled={isPending}
                />
                {upstreamModelError ? <p className="text-[11px] text-destructive">{upstreamModelError}</p> : null}
              </div>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" className="h-7 rounded-md border-border/55 px-2.5 text-[10px]">
                    Advanced cloud settings
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  <div className="rounded-sm border border-amber-300/30 bg-amber-500/10 px-2.5 py-2">
                    <p className="text-[10px] text-amber-100/90">
                      Hosted upstream relay is optional and non-default. For production local-first integrations,
                      keep provider credentials in app code via Dyno fallback adapters.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">
                      Upstream API key (optional hosted relay)
                    </Label>
                    <Input
                      type="password"
                      value={values.upstreamApiKey}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, upstreamApiKey: event.target.value }))
                      }
                      placeholder={apiKeyConfigured ? 'Enter new key to rotate' : 'Leave empty for app-owned fallback'}
                      className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                      disabled={isPending}
                      autoComplete="off"
                    />
                    <p className="text-[10px] text-muted-foreground/75">
                      {apiKeyConfigured ? 'Hosted relay API key configured' : 'No hosted relay API key configured'}
                      {apiKeyLastUpdatedAt ? ` • Updated ${new Date(apiKeyLastUpdatedAt).toLocaleString()}` : ''}
                    </p>
                    {upstreamApiKeyError ? <p className="text-[11px] text-destructive">{upstreamApiKeyError}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">Upstream base URL</Label>
                    <Input
                      value={values.upstreamBaseUrl}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, upstreamBaseUrl: event.target.value }))
                      }
                      placeholder="https://api.openai.com"
                      className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                      disabled={isPending}
                    />
                    {upstreamBaseUrlError ? <p className="text-[11px] text-destructive">{upstreamBaseUrlError}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">
                      Model alias used by SDK
                    </Label>
                    <p className="text-[10px] text-muted-foreground/70">
                      Managed automatically from use case and hidden from this screen.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-foreground/90">
                      Estimated cloud cost per request (USD)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.0001"
                      value={values.estimatedCloudCostPerRequestUsd}
                      onChange={(event) =>
                        setValues((previous) => ({
                          ...previous,
                          estimatedCloudCostPerRequestUsd: event.target.value,
                        }))
                      }
                      placeholder="0.0001"
                      className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                      disabled={isPending}
                    />
                    {estimatedCloudCostPerRequestUsdError ? (
                      <p className="text-[11px] text-destructive">{estimatedCloudCostPerRequestUsdError}</p>
                    ) : null}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {upstreamProviderError ? <p className="text-[11px] text-destructive">{upstreamProviderError}</p> : null}
            </div>

            <DialogFooter className="mt-1 gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-md border-border/55 px-3 text-[11px]"
                onClick={() => setShowCloudDialog(false)}
                disabled={isPending}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showLocalDialog} onOpenChange={setShowLocalDialog}>
          <DialogContent
            showCloseButton={!isPending}
            className="max-w-md gap-3 border-border/50 bg-card p-4 sm:max-w-md"
          >
            <DialogHeader className="gap-1">
              <DialogTitle className="text-[13px] font-semibold tracking-tight">Configure local</DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground/75">
                Configure local execution for on-device runs.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-foreground/90">Local model</Label>
              <Input
                value={values.localModel}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, localModel: event.target.value }))
                }
                placeholder="Xenova/all-MiniLM-L6-v2"
                className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                disabled={isPending}
                autoComplete="off"
              />
              <p className="text-[10px] text-muted-foreground/70">
                Status: {localEnabled ? 'Configured' : 'Not configured'}
              </p>
            </div>
            <DialogFooter className="mt-1 gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-md border-border/55 px-3 text-[11px]"
                onClick={() => setShowLocalDialog(false)}
                disabled={isPending}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showConditionsDialog} onOpenChange={setShowConditionsDialog}>
          <DialogContent
            showCloseButton={!isPending}
            className="max-w-md gap-3 border-border/50 bg-card p-4 sm:max-w-md"
          >
            <DialogHeader className="gap-1">
              <DialogTitle className="text-[13px] font-semibold tracking-tight">Edit conditions</DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground/75">
                Set simple runtime safeguards in plain language.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {!hasEditableRunConditions ? (
                <div className="rounded-md border border-border/45 bg-background/35 px-2.5 py-2">
                  <p className="text-[10px] text-muted-foreground/80">
                    These safeguards are shown for capability transparency and remain read-only until runtime
                    enforcement is active.
                  </p>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-foreground/90">Battery min percent</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={values.batteryMinPercent}
                    onChange={(event) =>
                      setValues((previous) => ({ ...previous, batteryMinPercent: event.target.value }))
                    }
                    placeholder="20"
                    className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                    disabled={isPending || !batteryMinPercentEditable}
                  />
                  <p className="text-[10px] text-muted-foreground/70">Minimum battery level required to run.</p>
                  {batteryError ? <p className="text-[11px] text-destructive">{batteryError}</p> : null}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-foreground/90">Idle min seconds</Label>
                  <Input
                    type="number"
                    min={0}
                    value={values.idleMinSeconds}
                    onChange={(event) =>
                      setValues((previous) => ({ ...previous, idleMinSeconds: event.target.value }))
                    }
                    placeholder="30"
                    className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                    disabled={isPending || !idleMinSecondsEditable}
                  />
                  <p className="text-[10px] text-muted-foreground/70">
                    Device must be idle for at least this long.
                  </p>
                  {idleError ? <p className="text-[11px] text-destructive">{idleError}</p> : null}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
                  <div>
                    <p className="text-[11px] font-medium text-foreground/90">Wi-Fi only</p>
                    <p className="text-[10px] text-muted-foreground/70">Block execution on cellular networks.</p>
                  </div>
                  <Switch
                    checked={values.wifiOnly}
                    onCheckedChange={(checked) =>
                      setValues((previous) => ({ ...previous, wifiOnly: checked }))
                    }
                    disabled={isPending || !wifiOnlyEditable}
                    aria-label="Wi-Fi only"
                  />
                </div>

                <div className="flex items-center justify-between rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
                  <div>
                    <p className="text-[11px] font-medium text-foreground/90">Requires charging</p>
                    <p className="text-[10px] text-muted-foreground/70">Only allow runs while charging.</p>
                  </div>
                  <Switch
                    checked={values.requiresCharging}
                    onCheckedChange={(checked) =>
                      setValues((previous) => ({ ...previous, requiresCharging: checked }))
                    }
                    disabled={isPending || !requiresChargingEditable}
                    aria-label="Requires charging"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-1 gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-md border-border/55 px-3 text-[11px]"
                onClick={() => setShowConditionsDialog(false)}
                disabled={isPending}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {state.status === 'error' && state.message ? (
          <ProjectInlineAlert tone="error">{state.message}</ProjectInlineAlert>
        ) : null}

        <ProjectInsetPanel className="bg-background/25">
          <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground/70">
            {hasClientErrors
              ? 'Resolve validation errors before saving.'
              : isDirty
                ? 'Unsaved changes.'
                : 'No unsaved changes.'}
          </p>
          <Button
            type="submit"
            className="h-8 rounded-md px-3 text-[11px] font-medium"
            disabled={isPending || !isDirty || hasClientErrors}
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
        </ProjectInsetPanel>
      </form>
    </ProjectSectionShell>
  )
}
