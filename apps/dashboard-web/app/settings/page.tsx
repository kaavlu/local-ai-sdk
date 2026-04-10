import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { PageHeader } from '@/components/dashboard/page-header'
import { getCurrentProfile, getCurrentWorkspace, updateProfile, updateWorkspace } from '@/lib/data/dashboard-data'
import type { Profile, Workspace } from '@/lib/data/dashboard-types'
import { SettingsForm } from '@/app/settings/_components/settings-form'

export type WorkspaceActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  values?: {
    name: string
  }
}

export type ProfileActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  values?: {
    fullName: string
    useType: string
  }
}

const initialWorkspaceActionState: WorkspaceActionState = {
  status: 'idle',
}

const initialProfileActionState: ProfileActionState = {
  status: 'idle',
}

async function saveWorkspaceAction(
  _previousState: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  'use server'

  const workspaceId = String(formData.get('workspaceId') ?? '').trim()
  const name = String(formData.get('workspaceName') ?? '').trim()

  if (!workspaceId) {
    return {
      status: 'error',
      message: 'Workspace is unavailable.',
      values: { name },
    }
  }

  if (!name) {
    return {
      status: 'error',
      message: 'Workspace name is required.',
      values: { name },
    }
  }

  try {
    const workspace = await updateWorkspace(workspaceId, { name })
    revalidatePath('/settings')

    return {
      status: 'success',
      message: 'Workspace saved.',
      values: { name: workspace.name },
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to save workspace.',
      values: { name },
    }
  }
}

async function saveProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  'use server'

  const fullName = String(formData.get('fullName') ?? '').trim()
  const useType = String(formData.get('useType') ?? '').trim()

  if (!useType) {
    return {
      status: 'error',
      message: 'Use type is required.',
      values: { fullName, useType },
    }
  }

  try {
    const profile = await updateProfile({
      full_name: fullName.length > 0 ? fullName : null,
      use_type: useType,
    })
    revalidatePath('/settings')

    return {
      status: 'success',
      message: 'Profile saved.',
      values: {
        fullName: profile.full_name ?? '',
        useType: profile.use_type ?? '',
      },
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to save profile.',
      values: { fullName, useType },
    }
  }
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  const [profile, workspace] = await Promise.all([getCurrentProfile(), getCurrentWorkspace()])

  const initialProfile: Profile = profile ?? {
    id: user.id,
    full_name: null,
    use_type: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const initialWorkspace: Workspace | null = workspace ?? null

  return (
    <DashboardLayout userEmail={user.email}>
      <PageHeader title="Settings" description="Manage workspace and profile settings." />

      <SettingsForm
        email={user.email ?? ''}
        initialWorkspace={initialWorkspace}
        initialProfile={initialProfile}
        saveWorkspaceAction={saveWorkspaceAction}
        saveProfileAction={saveProfileAction}
        initialWorkspaceActionState={initialWorkspaceActionState}
        initialProfileActionState={initialProfileActionState}
      />
    </DashboardLayout>
  )
}
