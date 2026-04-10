'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SUPPORTED_USE_CASE_OPTIONS } from '@/lib/data/supported-use-cases'

type CreateProjectFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: {
    name?: string
    useCaseType?: string
    strategyPreset?: string
  }
}

const initialState: CreateProjectFormState = {
  status: 'idle',
}

const strategyOptions = [
  { value: 'local_first', label: 'Local First' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'cloud_first', label: 'Cloud First' },
] as const

interface CreateProjectDialogProps {
  action: (state: CreateProjectFormState, formData: FormData) => Promise<CreateProjectFormState>
  triggerLabel?: string
  className?: string
}

function SubmitButton({ isPending }: { isPending: boolean }) {
  return (
    <Button
      type="submit"
      className="h-8 rounded-sm px-3 text-[11px] font-medium"
      disabled={isPending}
    >
      {isPending ? 'Creating...' : 'Create Project'}
    </Button>
  )
}

export function CreateProjectDialog({
  action,
  triggerLabel = 'Create Project',
  className,
}: CreateProjectDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [useCaseType, setUseCaseType] = useState('')
  const [strategyPreset, setStrategyPreset] = useState('')
  const [resetKey, setResetKey] = useState(0)

  const hasFieldError = useMemo(() => Boolean(state.fieldErrors), [state.fieldErrors])

  useEffect(() => {
    if (state.status !== 'success') {
      return
    }

    setOpen(false)
    setUseCaseType('')
    setStrategyPreset('')
    setResetKey((value) => value + 1)
    router.refresh()
  }, [router, state.status])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={className ?? 'h-[32px] rounded-sm text-[11px] font-medium gap-1.5'}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isPending}
        className="max-w-md gap-3 border-border/50 bg-card p-4 sm:max-w-md"
      >
        <DialogHeader className="gap-1">
          <DialogTitle className="text-[13px] font-semibold tracking-tight">Create Project</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground/75">
            Add a new project surface with a default runtime configuration.
          </DialogDescription>
        </DialogHeader>

        <form key={resetKey} action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-[11px] font-medium text-foreground/90">
              Project name
            </Label>
            <Input
              id="project-name"
              name="name"
              placeholder="SDK Mobile Assistant"
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isPending}
              autoComplete="off"
            />
            {state.fieldErrors?.name ? (
              <p className="text-[11px] text-destructive">{state.fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description" className="text-[11px] font-medium text-foreground/90">
              Description
            </Label>
            <Textarea
              id="project-description"
              name="description"
              rows={3}
              placeholder="Short context for this project surface."
              className="min-h-[74px] rounded-sm border-border/60 bg-background/60 px-2.5 py-2 text-[12px]"
              disabled={isPending}
            />
            <p className="text-[10px] text-muted-foreground/70">Optional.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-foreground/90">Use case</Label>
              <input type="hidden" name="useCaseType" value={useCaseType} />
              <Select value={useCaseType} onValueChange={setUseCaseType} disabled={isPending}>
                <SelectTrigger
                  aria-invalid={Boolean(state.fieldErrors?.useCaseType)}
                  className="h-8 w-full rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                >
                  <SelectValue placeholder="Select use case" />
                </SelectTrigger>
                <SelectContent className="border-border/60 bg-card">
                  {SUPPORTED_USE_CASE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-[12px]">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.fieldErrors?.useCaseType ? (
                <p className="text-[11px] text-destructive">{state.fieldErrors.useCaseType}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground/70">More use cases coming soon.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-foreground/90">Strategy</Label>
              <input type="hidden" name="strategyPreset" value={strategyPreset} />
              <Select value={strategyPreset} onValueChange={setStrategyPreset} disabled={isPending}>
                <SelectTrigger
                  aria-invalid={Boolean(state.fieldErrors?.strategyPreset)}
                  className="h-8 w-full rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                >
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent className="border-border/60 bg-card">
                  {strategyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-[12px]">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.fieldErrors?.strategyPreset ? (
                <p className="text-[11px] text-destructive">{state.fieldErrors.strategyPreset}</p>
              ) : null}
            </div>
          </div>

          {state.status === 'error' && state.message ? (
            <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
              {state.message}
            </p>
          ) : null}

          <DialogFooter className="mt-1 gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-sm px-3 text-[11px]"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <SubmitButton isPending={isPending} />
          </DialogFooter>
        </form>

        {hasFieldError ? (
          <p className="text-[10px] text-muted-foreground/70">Required fields must be set before creating.</p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
