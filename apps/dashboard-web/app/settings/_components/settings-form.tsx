'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Profile, Workspace } from '@/lib/data/dashboard-types'

type WorkspaceActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  values?: {
    name: string
  }
}

type ProfileActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  values?: {
    fullName: string
    useType: string
  }
}

const useTypeOptions = ['company', 'personal', 'experimenting'] as const
type UseTypeOption = (typeof useTypeOptions)[number]

function normalizeUseType(value: string | null): UseTypeOption {
  if (value === 'company' || value === 'personal' || value === 'experimenting') {
    return value
  }

  return 'personal'
}

type SettingsFormProps = {
  email: string
  initialWorkspace: Workspace | null
  initialProfile: Profile
  saveWorkspaceAction: (
    state: WorkspaceActionState,
    formData: FormData,
  ) => Promise<WorkspaceActionState>
  saveProfileAction: (
    state: ProfileActionState,
    formData: FormData,
  ) => Promise<ProfileActionState>
  initialWorkspaceActionState: WorkspaceActionState
  initialProfileActionState: ProfileActionState
}

export function SettingsForm({
  email,
  initialWorkspace,
  initialProfile,
  saveWorkspaceAction,
  saveProfileAction,
  initialWorkspaceActionState,
  initialProfileActionState,
}: SettingsFormProps) {
  const [workspaceState, workspaceFormAction, isWorkspaceSaving] = useActionState(
    saveWorkspaceAction,
    initialWorkspaceActionState,
  )
  const [profileState, profileFormAction, isProfileSaving] = useActionState(
    saveProfileAction,
    initialProfileActionState,
  )
  const [isBooting, setIsBooting] = useState(true)

  const [workspaceName, setWorkspaceName] = useState(initialWorkspace?.name ?? '')
  const [savedWorkspaceName, setSavedWorkspaceName] = useState(initialWorkspace?.name ?? '')

  const [fullName, setFullName] = useState(initialProfile.full_name ?? '')
  const [savedFullName, setSavedFullName] = useState(initialProfile.full_name ?? '')
  const [useType, setUseType] = useState<UseTypeOption>(normalizeUseType(initialProfile.use_type))
  const [savedUseType, setSavedUseType] = useState<UseTypeOption>(
    normalizeUseType(initialProfile.use_type),
  )

  useEffect(() => {
    setIsBooting(false)
  }, [])

  useEffect(() => {
    if (workspaceState.values?.name !== undefined) {
      setWorkspaceName(workspaceState.values.name)
    }

    if (workspaceState.status === 'success' && workspaceState.values?.name !== undefined) {
      setSavedWorkspaceName(workspaceState.values.name)
    }
  }, [workspaceState])

  useEffect(() => {
    if (profileState.values) {
      setFullName(profileState.values.fullName)
      setUseType(normalizeUseType(profileState.values.useType))
    }

    if (profileState.status === 'success' && profileState.values) {
      setSavedFullName(profileState.values.fullName)
      setSavedUseType(normalizeUseType(profileState.values.useType))
    }
  }, [profileState])

  const workspaceError = useMemo(() => {
    if (!workspaceName.trim()) return 'Workspace name is required.'
    return null
  }, [workspaceName])

  const workspaceIsDirty = workspaceName.trim() !== savedWorkspaceName.trim()
  const profileIsDirty = fullName.trim() !== savedFullName.trim() || useType !== savedUseType
  return (
    <div className="max-w-3xl space-y-4 animate-fade-in-up">
      <div className="rounded-lg border border-border/40 bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[12px] font-semibold text-foreground">Workspace</h2>
            <p className="text-[11px] text-muted-foreground/70">Update your workspace name.</p>
          </div>
          {workspaceState.status === 'success' && !workspaceIsDirty ? (
            <p className="text-[10px] text-primary/90">Saved.</p>
          ) : workspaceState.status === 'error' ? (
            <p className="text-[10px] text-destructive">Save failed.</p>
          ) : null}
        </div>

        <form action={workspaceFormAction} className="space-y-3">
          <input type="hidden" name="workspaceId" value={initialWorkspace?.id ?? ''} />

          <div className="space-y-1.5">
            <Label htmlFor="workspace-name" className="text-[11px] font-medium text-foreground/90">
              Workspace name
            </Label>
            <Input
              id="workspace-name"
              name="workspaceName"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="My Workspace"
              className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
              disabled={isWorkspaceSaving || isBooting || !initialWorkspace}
              autoComplete="off"
            />
            {workspaceError ? <p className="text-[11px] text-destructive">{workspaceError}</p> : null}
            {!initialWorkspace ? (
              <p className="text-[11px] text-muted-foreground/70">
                Workspace is still provisioning. Refresh in a moment.
              </p>
            ) : null}
          </div>

          {workspaceState.status === 'error' && workspaceState.message ? (
            <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
              {workspaceState.message}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-muted-foreground/70">
              {workspaceIsDirty ? 'Unsaved changes.' : 'No unsaved changes.'}
            </p>
            <Button
              type="submit"
              className="h-8 rounded-sm px-3 text-[11px] font-medium"
              disabled={
                isWorkspaceSaving ||
                isBooting ||
                !initialWorkspace ||
                !workspaceIsDirty ||
                workspaceError !== null
              }
            >
              {isWorkspaceSaving ? 'Saving...' : 'Save workspace'}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-border/40 bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[12px] font-semibold text-foreground">Profile</h2>
            <p className="text-[11px] text-muted-foreground/70">Manage your personal profile details.</p>
          </div>
          {profileState.status === 'success' && !profileIsDirty ? (
            <p className="text-[10px] text-primary/90">Saved.</p>
          ) : profileState.status === 'error' ? (
            <p className="text-[10px] text-destructive">Save failed.</p>
          ) : null}
        </div>

        <form action={profileFormAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="full-name" className="text-[11px] font-medium text-foreground/90">
                Full name
              </Label>
              <Input
                id="full-name"
                name="fullName"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Jane Doe"
                className="h-8 rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]"
                disabled={isProfileSaving || isBooting}
                autoComplete="name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[11px] font-medium text-foreground/90">
                Email
              </Label>
              <Input
                id="email"
                value={email}
                readOnly
                className="h-8 rounded-sm border-border/60 bg-muted/30 px-2.5 text-[12px] text-muted-foreground/90"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-foreground/90">Use type</Label>
            <input type="hidden" name="useType" value={useType} />
            <Select value={useType} onValueChange={setUseType} disabled={isProfileSaving || isBooting}>
              <SelectTrigger className="h-8 w-full rounded-sm border-border/60 bg-background/60 px-2.5 text-[12px]">
                <SelectValue placeholder="Select use type" />
              </SelectTrigger>
              <SelectContent>
                {useTypeOptions.map((option) => (
                  <SelectItem key={option} value={option} className="text-[12px]">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {profileState.status === 'error' && profileState.message ? (
            <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
              {profileState.message}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-muted-foreground/70">
              {profileIsDirty ? 'Unsaved changes.' : 'No unsaved changes.'}
            </p>
            <Button
              type="submit"
              className="h-8 rounded-sm px-3 text-[11px] font-medium"
              disabled={isProfileSaving || isBooting || !profileIsDirty}
            >
              {isProfileSaving ? 'Saving...' : 'Save profile'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
