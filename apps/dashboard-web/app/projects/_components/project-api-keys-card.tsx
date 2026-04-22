'use client'

import { useActionState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ProjectInlineAlert,
  ProjectInsetPanel,
  ProjectSectionShell,
  ProjectStatusBadge,
} from '@/app/projects/_components/project-detail-primitives'
import type { ProjectApiKeyListItem } from '@/lib/data/dashboard-types'

type CreateApiKeyState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  createdKey?: string
}

type RevokeApiKeyState = {
  status: 'idle' | 'success' | 'error'
  message?: string
}

const initialCreateState: CreateApiKeyState = { status: 'idle' }
const initialRevokeState: RevokeApiKeyState = { status: 'idle' }

interface ProjectApiKeysCardProps {
  keys: ProjectApiKeyListItem[]
  activeKeyCount: number
  createAction: (state: CreateApiKeyState, formData: FormData) => Promise<CreateApiKeyState>
  revokeAction: (state: RevokeApiKeyState, formData: FormData) => Promise<RevokeApiKeyState>
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Never'
  }
  return new Date(value).toLocaleString()
}

export function ProjectApiKeysCard({ keys, activeKeyCount, createAction, revokeAction }: ProjectApiKeysCardProps) {
  const [createState, createFormAction, createPending] = useActionState(createAction, initialCreateState)
  const [revokeState, revokeFormAction, revokePending] = useActionState(revokeAction, initialRevokeState)

  return (
    <ProjectSectionShell
      title="Dyno API Keys"
      description="Create and manage project API keys for authenticated requests."
      action={
        <ProjectStatusBadge tone="neutral">
          Active keys: {activeKeyCount}
        </ProjectStatusBadge>
      }
    >
      <ProjectInsetPanel className="mb-3 p-2">
        <form action={createFormAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            name="label"
            placeholder="Label (optional)"
            className="h-8 rounded-md border-border/60 bg-background/60 px-2.5 text-[12px]"
            disabled={createPending}
            autoComplete="off"
          />
          <Button type="submit" className="h-8 rounded-md px-3 text-[11px] font-medium" disabled={createPending}>
            {createPending ? 'Creating...' : 'Create API Key'}
          </Button>
        </form>
        <p className="mt-2 text-[10px] text-muted-foreground/75">
          Use these as <code className="font-mono">DYNO_PROJECT_API_KEY</code> in your app and the Request Tester.
        </p>
      </ProjectInsetPanel>

      {createState.status === 'success' && createState.createdKey ? (
        <ProjectInlineAlert tone="warning" title="Copy this key now. It will not be shown again." className="mb-3">
          <p className="mt-1 break-all font-mono text-[11px] text-foreground">{createState.createdKey}</p>
        </ProjectInlineAlert>
      ) : null}

      {createState.status === 'error' && createState.message ? (
        <ProjectInlineAlert tone="error" className="mb-3">
          {createState.message}
        </ProjectInlineAlert>
      ) : null}

      {revokeState.status === 'error' && revokeState.message ? (
        <ProjectInlineAlert tone="error" className="mb-3">
          {revokeState.message}
        </ProjectInlineAlert>
      ) : null}

      <div className="space-y-2">
        {keys.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 bg-background/30 px-3 py-3 text-[11px] text-muted-foreground/80">
            No API keys created yet. Requests cannot authenticate until you create at least one Dyno API key.
          </p>
        ) : (
          keys.map((key) => {
            const isRevoked = Boolean(key.revoked_at)
            return (
              <div key={key.id} className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/30 p-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-foreground">
                    {key.label?.trim() || 'Untitled key'}{' '}
                    <span className="text-muted-foreground/70">({key.key_prefix}...)</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/80">
                    <span>Created {formatDate(key.created_at)}</span>
                    <span>•</span>
                    <span>Last used {formatDate(key.last_used_at)}</span>
                    <Badge variant={isRevoked ? 'outline' : 'secondary'} className="ml-1 rounded-md px-1.5 py-0 text-[9px]">
                      {isRevoked ? 'Revoked' : 'Active'}
                    </Badge>
                  </div>
                </div>
                <form action={revokeFormAction}>
                  <input type="hidden" name="keyId" value={key.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-7 rounded-md border-border/55 px-2.5 text-[10px]"
                    disabled={revokePending || isRevoked}
                  >
                    {isRevoked ? 'Revoked' : revokePending ? 'Revoking...' : 'Revoke'}
                  </Button>
                </form>
              </div>
            )
          })
        )}
      </div>
    </ProjectSectionShell>
  )
}
