'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    <div className="rounded-lg border border-border/40 bg-card p-5">
      <div className="mb-3">
        <h2 className="text-[12px] font-semibold text-foreground">Dyno API Keys</h2>
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          Create project-scoped keys for OpenAI-compatible bearer auth. Keys are only shown once at creation.
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/75">
          Active keys: {activeKeyCount}. The Integration section uses one of these as{' '}
          <code className="font-mono">DYNO_API_KEY</code>.
        </p>
      </div>

      <form action={createFormAction} className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          name="label"
          placeholder="Label (optional)"
          className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
          disabled={createPending}
          autoComplete="off"
        />
        <Button type="submit" className="h-8 rounded-sm px-3 text-[11px] font-medium" disabled={createPending}>
          {createPending ? 'Creating...' : 'Create API Key'}
        </Button>
      </form>

      {createState.status === 'success' && createState.createdKey ? (
        <div className="mb-4 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2.5">
          <p className="text-[11px] font-medium text-foreground">Copy this key now. It will not be shown again.</p>
          <p className="mt-1 break-all font-mono text-[11px] text-foreground">{createState.createdKey}</p>
        </div>
      ) : null}

      {createState.status === 'error' && createState.message ? (
        <p className="mb-3 rounded-sm border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          {createState.message}
        </p>
      ) : null}

      {revokeState.status === 'error' && revokeState.message ? (
        <p className="mb-3 rounded-sm border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          {revokeState.message}
        </p>
      ) : null}

      <div className="space-y-2">
        {keys.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border/60 bg-background/30 px-3 py-3 text-[11px] text-muted-foreground/80">
            No API keys created yet. Requests cannot authenticate until you create at least one Dyno API key.
          </p>
        ) : (
          keys.map((key) => {
            const isRevoked = Boolean(key.revoked_at)
            return (
              <div
                key={key.id}
                className="flex flex-col gap-2 rounded-sm border border-border/40 bg-background/30 p-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-foreground">
                    {key.label?.trim() || 'Untitled key'}{' '}
                    <span className="text-muted-foreground/70">({key.key_prefix}...)</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/80">
                    Created {formatDate(key.created_at)} • Last used {formatDate(key.last_used_at)} •{' '}
                    {isRevoked ? 'Revoked' : 'Active'}
                  </p>
                </div>
                <form action={revokeFormAction}>
                  <input type="hidden" name="keyId" value={key.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-7 rounded-sm px-2.5 text-[10px]"
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
    </div>
  )
}
