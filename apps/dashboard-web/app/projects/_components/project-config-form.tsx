'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ProjectConfig } from '@/lib/data/dashboard-types'

export type ProjectConfigFormValues = {
  localModel: string
  cloudModel: string
  batteryMinPercent: string
  idleMinSeconds: string
  requiresCharging: boolean
  wifiOnly: boolean
}

export type ProjectConfigFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: {
    batteryMinPercent?: string
    idleMinSeconds?: string
  }
  values?: ProjectConfigFormValues
}

const initialState: ProjectConfigFormState = {
  status: 'idle',
}

function toFormValues(config: ProjectConfig | null): ProjectConfigFormValues {
  return {
    localModel: config?.local_model ?? '',
    cloudModel: config?.cloud_model ?? '',
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

function getClientFieldErrors(values: ProjectConfigFormValues) {
  const errors: ProjectConfigFormState['fieldErrors'] = {}

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
  initialConfig: ProjectConfig | null
  action: (
    state: ProjectConfigFormState,
    formData: FormData,
  ) => Promise<ProjectConfigFormState>
}

export function ProjectConfigForm({ projectId, initialConfig, action }: ProjectConfigFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [values, setValues] = useState<ProjectConfigFormValues>(() => toFormValues(initialConfig))
  const [lastSavedValues, setLastSavedValues] = useState<ProjectConfigFormValues>(() =>
    toFormValues(initialConfig),
  )

  useEffect(() => {
    if (state.values) {
      setValues(state.values)
    }

    if (state.status === 'success' && state.values) {
      setLastSavedValues(state.values)
    }
  }, [state.status, state.values])

  const clientFieldErrors = useMemo(() => getClientFieldErrors(values), [values])
  const hasClientErrors = Object.keys(clientFieldErrors).length > 0

  const isDirty = useMemo(() => {
    return (
      values.localModel !== lastSavedValues.localModel ||
      values.cloudModel !== lastSavedValues.cloudModel ||
      values.batteryMinPercent !== lastSavedValues.batteryMinPercent ||
      values.idleMinSeconds !== lastSavedValues.idleMinSeconds ||
      values.requiresCharging !== lastSavedValues.requiresCharging ||
      values.wifiOnly !== lastSavedValues.wifiOnly
    )
  }, [lastSavedValues, values])

  const batteryError = clientFieldErrors.batteryMinPercent ?? state.fieldErrors?.batteryMinPercent
  const idleError = clientFieldErrors.idleMinSeconds ?? state.fieldErrors?.idleMinSeconds

  return (
    <div className="rounded-lg border border-border/40 bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold text-foreground">Configuration</h2>
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
              placeholder="llama3.2:3b-instruct"
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cloud-model" className="text-[11px] font-medium text-foreground/90">
              Cloud model
            </Label>
            <Input
              id="cloud-model"
              name="cloudModel"
              value={values.cloudModel}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, cloudModel: event.target.value }))
              }
              placeholder="gpt-4.1-mini"
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
              autoComplete="off"
            />
          </div>

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

        <div className="grid gap-2 sm:grid-cols-2">
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
