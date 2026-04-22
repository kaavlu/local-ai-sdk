'use client'

import { useActionState, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  ProjectInlineAlert,
  ProjectInsetPanel,
  ProjectSectionShell,
  ProjectStatusBadge,
} from '@/app/projects/_components/project-detail-primitives'

export interface ProjectRequestTesterState {
  status: 'idle' | 'success' | 'error'
  message?: string
  responsePreview?: string
  httpStatus?: number
  values: {
    requestInput: string
  }
}

const INITIAL_REQUEST_TESTER_STATE: ProjectRequestTesterState = {
  status: 'idle',
  values: {
    requestInput: '',
  },
}

interface ProjectRequestTesterCardProps {
  useCaseType: string
  logicalModel: string
  action: (state: ProjectRequestTesterState, formData: FormData) => Promise<ProjectRequestTesterState>
}

export function ProjectRequestTesterCard({ useCaseType, logicalModel, action }: ProjectRequestTesterCardProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_REQUEST_TESTER_STATE)
  const [dynoApiKey, setDynoApiKey] = useState('')
  const isChat = useCaseType === 'text_generation'
  const endpoint = isChat ? '/v1/chat/completions' : '/v1/embeddings'

  useEffect(() => {
    const stored = window.localStorage.getItem('dyno-dashboard-request-tester-key')
    if (stored) {
      setDynoApiKey(stored)
    }
  }, [])

  const statusTone =
    state.status === 'success'
      ? 'border-emerald-500/35 bg-emerald-500/10'
      : state.status === 'error'
        ? 'border-destructive/35 bg-destructive/10'
        : 'border-border/45 bg-background/30'

  return (
    <ProjectSectionShell
      title="Request Tester"
      description="Run a live request and inspect the response inline."
      action={
        <div className="flex items-center gap-1.5">
          <ProjectStatusBadge tone="neutral">
            {endpoint}
          </ProjectStatusBadge>
          <ProjectStatusBadge tone={state.status === 'success' ? 'success' : state.status === 'error' ? 'error' : 'neutral'}>
            {state.status === 'idle' ? 'Idle' : state.status === 'success' ? 'Success' : 'Error'}
          </ProjectStatusBadge>
        </div>
      }
    >
      <div className="space-y-3">
        {pending ? (
          <ProjectInlineAlert tone="neutral">Sending request...</ProjectInlineAlert>
        ) : null}

        <form action={formAction} className="space-y-3 rounded-md border border-border/50 bg-background/25 p-3">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/75">Dyno API key</p>
          <Input
            name="dynoApiKey"
            type="password"
            placeholder="Paste a project Dyno API key"
            className="h-8 rounded-md border-border/60 bg-background/60 px-2.5 text-[12px]"
            disabled={pending}
            autoComplete="off"
            value={dynoApiKey}
            onChange={(event) => {
              const nextValue = event.target.value
              setDynoApiKey(nextValue)
              window.localStorage.setItem('dyno-dashboard-request-tester-key', nextValue)
            }}
          />
          <p className="mt-1 text-[10px] text-muted-foreground/75">
            Enter once per browser session. You can rotate/update it here at any time.
          </p>

          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/75">
            {isChat ? 'Prompt' : 'Input text'}
          </p>
          <Textarea
            name="requestInput"
            placeholder={isChat ? 'Write a short prompt' : 'Write text to embed'}
            className="min-h-24 rounded-md border-border/60 bg-background/60 px-2.5 py-2 text-[12px]"
            defaultValue={state.values.requestInput}
            disabled={pending}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-muted-foreground/80">
              Model: <code className="font-mono">{logicalModel}</code>
            </p>
            <Button type="submit" className="h-8 rounded-md px-3 text-[11px] font-medium" disabled={pending}>
              {pending ? 'Sending...' : 'Send test request'}
            </Button>
          </div>
        </form>
      </div>

      {state.status !== 'idle' ? (
        <div className={`mt-3 rounded-md border px-3 py-2 ${statusTone}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Latest result</p>
            {state.httpStatus != null ? (
              <Badge variant="outline" className="rounded-md border-border/55 px-2 py-0.5 text-[10px]">
                HTTP {state.httpStatus}
              </Badge>
            ) : null}
          </div>
          {state.message ? (
            <p
              className={`mt-1 text-[11px] ${state.status === 'error' ? 'text-destructive' : 'text-foreground/90'}`}
            >
              {state.message}
            </p>
          ) : null}
          {state.responsePreview ? (
            <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border/45 bg-background/55 p-2 text-[10px] leading-relaxed text-foreground/90">
              {state.responsePreview}
            </pre>
          ) : null}
        </div>
      ) : null}
    </ProjectSectionShell>
  )
}
