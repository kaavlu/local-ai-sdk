'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ProjectConfig, StrategyPreset, UpstreamProviderType } from '@/lib/data/dashboard-types'

export type ProjectConfigFormValues = {
  strategyPreset: StrategyPreset
  fallbackEnabled: boolean
  logicalModel: string
  upstreamProviderType: UpstreamProviderType
  upstreamBaseUrl: string
  upstreamModel: string
  upstreamApiKey: string
  localModel: string
  batteryMinPercent: string
  idleMinSeconds: string
  requiresCharging: boolean
  wifiOnly: boolean
}

export type ProjectConfigFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: {
    strategyPreset?: string
    logicalModel?: string
    upstreamProviderType?: string
    upstreamBaseUrl?: string
    upstreamModel?: string
    upstreamApiKey?: string
    batteryMinPercent?: string
    idleMinSeconds?: string
  }
  values?: ProjectConfigFormValues
  apiKeyConfigured?: boolean
  apiKeyLastUpdatedAt?: string | null
}

const initialState: ProjectConfigFormState = {
  status: 'idle',
}

function toFormValues(config: ProjectConfig | null, strategyPreset: StrategyPreset): ProjectConfigFormValues {
  return {
    strategyPreset,
    fallbackEnabled: config?.fallback_enabled ?? true,
    logicalModel: config?.logical_model ?? 'dyno-embeddings-1',
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
    requiresCharging: config?.requires_charging ?? false,
    wifiOnly: config?.wifi_only ?? false,
  }
}

function getClientFieldErrors(values: ProjectConfigFormValues, apiKeyConfigured: boolean) {
  const errors: ProjectConfigFormState['fieldErrors'] = {}

  if (!values.logicalModel.trim()) {
    errors.logicalModel = 'Logical model is required.'
  }
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
    if (!apiKeyConfigured && !values.upstreamApiKey.trim()) {
      errors.upstreamApiKey = 'API key is required when fallback is enabled.'
    }
  }

  if (values.batteryMinPercent !== '') {
    const parsed = Number(values.batteryMinPercent)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      errors.batteryMinPercent = 'Enter 0-100 or leave empty.'
    }
  }

  if (values.idleMinSeconds !== '') {
    const parsed = Number(values.idleMinSeconds)
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.idleMinSeconds = 'Enter 0 or higher, or leave empty.'
    }
  }

  return errors
}

interface ProjectConfigFormProps {
  projectId: string
  initialStrategyPreset: StrategyPreset
  initialConfig: ProjectConfig | null
  action: (
    state: ProjectConfigFormState,
    formData: FormData,
  ) => Promise<ProjectConfigFormState>
}

export function ProjectConfigForm({
  projectId,
  initialStrategyPreset,
  initialConfig,
  action,
}: ProjectConfigFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [values, setValues] = useState<ProjectConfigFormValues>(() =>
    toFormValues(initialConfig, initialStrategyPreset),
  )
  const [lastSavedValues, setLastSavedValues] = useState<ProjectConfigFormValues>(() =>
    toFormValues(initialConfig, initialStrategyPreset),
  )
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(
    initialConfig?.upstream_api_key_configured ?? false,
  )
  const [apiKeyLastUpdatedAt, setApiKeyLastUpdatedAt] = useState<string | null>(
    initialConfig?.upstream_api_key_last_updated_at ?? null,
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
    () => getClientFieldErrors(values, apiKeyConfigured),
    [apiKeyConfigured, values],
  )
  const hasClientErrors = Object.keys(clientFieldErrors).length > 0

  const isDirty = useMemo(() => {
    return (
      values.strategyPreset !== lastSavedValues.strategyPreset ||
      values.fallbackEnabled !== lastSavedValues.fallbackEnabled ||
      values.logicalModel !== lastSavedValues.logicalModel ||
      values.upstreamProviderType !== lastSavedValues.upstreamProviderType ||
      values.upstreamBaseUrl !== lastSavedValues.upstreamBaseUrl ||
      values.upstreamModel !== lastSavedValues.upstreamModel ||
      values.upstreamApiKey !== '' ||
      values.localModel !== lastSavedValues.localModel ||
      values.batteryMinPercent !== lastSavedValues.batteryMinPercent ||
      values.idleMinSeconds !== lastSavedValues.idleMinSeconds ||
      values.requiresCharging !== lastSavedValues.requiresCharging ||
      values.wifiOnly !== lastSavedValues.wifiOnly
    )
  }, [lastSavedValues, values])

  const batteryError = clientFieldErrors.batteryMinPercent ?? state.fieldErrors?.batteryMinPercent
  const idleError = clientFieldErrors.idleMinSeconds ?? state.fieldErrors?.idleMinSeconds
  const logicalModelError = clientFieldErrors.logicalModel ?? state.fieldErrors?.logicalModel
  const upstreamProviderError =
    clientFieldErrors.upstreamProviderType ?? state.fieldErrors?.upstreamProviderType
  const upstreamBaseUrlError = clientFieldErrors.upstreamBaseUrl ?? state.fieldErrors?.upstreamBaseUrl
  const upstreamModelError = clientFieldErrors.upstreamModel ?? state.fieldErrors?.upstreamModel
  const upstreamApiKeyError = clientFieldErrors.upstreamApiKey ?? state.fieldErrors?.upstreamApiKey

  return (
    <div className="rounded-lg border border-border/40 bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-semibold text-foreground">Runtime Configuration</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            Configure fallback behavior, model mapping, and execution safeguards.
          </p>
        </div>
        {state.status === 'success' && !isDirty ? (
          <p className="text-[10px] text-primary/90">Saved.</p>
        ) : state.status === 'error' && state.message ? (
          <p className="text-[10px] text-destructive">Save failed.</p>
        ) : null}
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="projectId" value={projectId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="strategy-preset" className="text-[11px] font-medium text-foreground/90">
              Strategy preset
            </Label>
            <select
              id="strategy-preset"
              name="strategyPreset"
              value={values.strategyPreset}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  strategyPreset: event.target.value as StrategyPreset,
                }))
              }
              className="h-8 w-full rounded-sm border border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
            >
              <option value="local_first">Local first</option>
              <option value="balanced">Balanced</option>
              <option value="cloud_first">Cloud first</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="logical-model" className="text-[11px] font-medium text-foreground/90">
              Logical model
            </Label>
            <Input
              id="logical-model"
              name="logicalModel"
              value={values.logicalModel}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, logicalModel: event.target.value }))
              }
              placeholder="dyno-embeddings-1"
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
              autoComplete="off"
            />
            {logicalModelError ? <p className="text-[11px] text-destructive">{logicalModelError}</p> : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="upstream-provider-type" className="text-[11px] font-medium text-foreground/90">
              Upstream provider
            </Label>
            <select
              id="upstream-provider-type"
              name="upstreamProviderType"
              value={values.upstreamProviderType}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  upstreamProviderType: event.target.value as UpstreamProviderType,
                }))
              }
              className="h-8 w-full rounded-sm border border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
            >
              <option value="openai_compatible">OpenAI-compatible</option>
            </select>
            {upstreamProviderError ? <p className="text-[11px] text-destructive">{upstreamProviderError}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="upstream-base-url" className="text-[11px] font-medium text-foreground/90">
              Upstream base URL
            </Label>
            <Input
              id="upstream-base-url"
              name="upstreamBaseUrl"
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
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="upstream-model" className="text-[11px] font-medium text-foreground/90">
              Upstream model
            </Label>
            <Input
              id="upstream-model"
              name="upstreamModel"
              value={values.upstreamModel}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, upstreamModel: event.target.value }))
              }
              placeholder="text-embedding-3-small"
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
            />
            {upstreamModelError ? <p className="text-[11px] text-destructive">{upstreamModelError}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="upstream-api-key" className="text-[11px] font-medium text-foreground/90">
              Upstream API key
            </Label>
            <Input
              id="upstream-api-key"
              name="upstreamApiKey"
              type="password"
              value={values.upstreamApiKey}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, upstreamApiKey: event.target.value }))
              }
              placeholder={apiKeyConfigured ? 'Enter new key to rotate' : 'Enter provider API key'}
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
              autoComplete="off"
            />
            <p className="text-[10px] text-muted-foreground/75">
              {apiKeyConfigured ? 'API key configured' : 'No API key configured'}
              {apiKeyLastUpdatedAt ? ` • Updated ${new Date(apiKeyLastUpdatedAt).toLocaleString()}` : ''}
            </p>
            {upstreamApiKeyError ? <p className="text-[11px] text-destructive">{upstreamApiKeyError}</p> : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
            <div>
              <p className="text-[11px] font-medium text-foreground/90">Fallback enabled</p>
              <p className="text-[10px] text-muted-foreground/70">Route to cloud upstream when local is unavailable.</p>
            </div>
            <div>
              <input type="hidden" name="fallbackEnabled" value={values.fallbackEnabled ? 'true' : 'false'} />
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

          <div className="flex items-center justify-between rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
            <div>
              <p className="text-[11px] font-medium text-foreground/90">Wi-Fi only</p>
              <p className="text-[10px] text-muted-foreground/70">Prevent cellular network execution.</p>
            </div>
            <div>
              <input type="hidden" name="wifiOnly" value={values.wifiOnly ? 'true' : 'false'} />
              <Switch
                checked={values.wifiOnly}
                onCheckedChange={(checked) =>
                  setValues((previous) => ({ ...previous, wifiOnly: checked }))
                }
                disabled={isPending}
                aria-label="Wi-Fi only"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="local-model" className="text-[11px] font-medium text-foreground/90">
              Local model
            </Label>
            <Input
              id="local-model"
              name="localModel"
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

          <div className="flex items-center justify-between rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
            <div>
              <p className="text-[11px] font-medium text-foreground/90">Requires charging</p>
              <p className="text-[10px] text-muted-foreground/70">Allow runs only while charging.</p>
            </div>
            <div>
              <input
                type="hidden"
                name="requiresCharging"
                value={values.requiresCharging ? 'true' : 'false'}
              />
              <Switch
                checked={values.requiresCharging}
                onCheckedChange={(checked) =>
                  setValues((previous) => ({ ...previous, requiresCharging: checked }))
                }
                disabled={isPending}
                aria-label="Requires charging"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="battery-min-percent" className="text-[11px] font-medium text-foreground/90">
              Battery min percent
            </Label>
            <Input
              id="battery-min-percent"
              name="batteryMinPercent"
              type="number"
              min={0}
              max={100}
              value={values.batteryMinPercent}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, batteryMinPercent: event.target.value }))
              }
              placeholder="20"
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
            />
            {batteryError ? <p className="text-[11px] text-destructive">{batteryError}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="idle-min-seconds" className="text-[11px] font-medium text-foreground/90">
              Idle min seconds
            </Label>
            <Input
              id="idle-min-seconds"
              name="idleMinSeconds"
              type="number"
              min={0}
              value={values.idleMinSeconds}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, idleMinSeconds: event.target.value }))
              }
              placeholder="30"
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
            />
            {idleError ? <p className="text-[11px] text-destructive">{idleError}</p> : null}
          </div>
        </div>

        {state.status === 'error' && state.message ? (
          <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
            {state.message}
          </p>
        ) : null}

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
            className="h-8 rounded-sm px-3 text-[11px] font-medium"
            disabled={isPending || !isDirty || hasClientErrors}
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}
