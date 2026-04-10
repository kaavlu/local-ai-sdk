import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  deleteProject,
  getProjectById,
  getProjectConfig,
  updateProjectConfig,
  updateProjectStatus,
} from '@/lib/data/dashboard-data'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProjectDeleteAction } from '@/app/projects/_components/project-delete-action'
import {
  ProjectConfigForm,
  type ProjectConfigFormState,
  type ProjectConfigFormValues,
} from '@/app/projects/_components/project-config-form'
import { ProjectIntegrationCard } from '@/app/projects/_components/project-integration-card'

interface ProjectDetailPageProps {
  params: Promise<{
    projectId: string
  }>
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

  const config = await getProjectConfig(project.id)

  async function updateProjectConfigAction(
    _: ProjectConfigFormState,
    formData: FormData,
  ): Promise<ProjectConfigFormState> {
    'use server'

    const localModelRaw = String(formData.get('localModel') ?? '')
    const cloudModelRaw = String(formData.get('cloudModel') ?? '')
    const batteryMinPercentRaw = String(formData.get('batteryMinPercent') ?? '')
    const idleMinSecondsRaw = String(formData.get('idleMinSeconds') ?? '')
    const requiresChargingRaw = String(formData.get('requiresCharging') ?? 'false')
    const wifiOnlyRaw = String(formData.get('wifiOnly') ?? 'false')

    const values: ProjectConfigFormValues = {
      localModel: localModelRaw,
      cloudModel: cloudModelRaw,
      batteryMinPercent: batteryMinPercentRaw,
      idleMinSeconds: idleMinSecondsRaw,
      requiresCharging: requiresChargingRaw === 'true',
      wifiOnly: wifiOnlyRaw === 'true',
    }

    const fieldErrors: ProjectConfigFormState['fieldErrors'] = {}

    const parsedBattery =
      batteryMinPercentRaw.trim() === '' ? null : Number.parseFloat(batteryMinPercentRaw)
    if (parsedBattery !== null && (!Number.isFinite(parsedBattery) || parsedBattery < 0 || parsedBattery > 100)) {
      fieldErrors.batteryMinPercent = 'Enter 0-100 or leave empty.'
    }

    const parsedIdle = idleMinSecondsRaw.trim() === '' ? null : Number.parseFloat(idleMinSecondsRaw)
    if (parsedIdle !== null && (!Number.isFinite(parsedIdle) || parsedIdle < 0)) {
      fieldErrors.idleMinSeconds = 'Enter 0 or higher, or leave empty.'
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        status: 'error',
        fieldErrors,
        values,
      }
    }

    try {
      await updateProjectConfig(project.id, {
        local_model: localModelRaw.trim() || null,
        cloud_model: cloudModelRaw.trim() || null,
        battery_min_percent: parsedBattery,
        idle_min_seconds: parsedIdle,
        requires_charging: values.requiresCharging,
        wifi_only: values.wifiOnly,
      })
      await updateProjectStatus(project.id, 'active')
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save configuration.',
        values,
      }
    }

    revalidatePath('/projects')
    redirect('/projects')
  }

  async function deleteProjectAction(_: { status: 'idle' | 'error'; message?: string }) {
    'use server'

    try {
      await deleteProject(project.id)
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Failed to delete project.',
      }
    }

    redirect('/projects')
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground tracking-tight">{project.name}</h1>
          {project.description ? (
            <p className="mt-1 max-w-[640px] text-[12px] text-muted-foreground/80">{project.description}</p>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground/65">No description provided.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProjectDeleteAction projectName={project.name} action={deleteProjectAction} />
          <Button asChild variant="outline" className="h-[32px] rounded-sm text-[11px] font-medium">
            <Link href="/projects">Back to Projects</Link>
          </Button>
        </div>
      </div>

      <div className="max-w-3xl space-y-3">
        <div className="rounded-lg border border-border/40 bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="rounded-sm px-1.5 text-[10px] uppercase tracking-wide">
              {project.use_case_type.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline" className="rounded-sm border-border/50 px-1.5 text-[10px]">
              {project.strategy_preset.replace(/_/g, ' ')}
            </Badge>
            <Badge
              variant={project.status === 'active' ? 'default' : 'secondary'}
              className="rounded-sm px-1.5 text-[10px] capitalize"
            >
              {project.status}
            </Badge>
          </div>
        </div>

        <ProjectConfigForm
          projectId={project.id}
          initialConfig={config}
          action={updateProjectConfigAction}
        />

        <ProjectIntegrationCard
          projectId={project.id}
          useCaseType={project.use_case_type}
          strategyPreset={project.strategy_preset}
          localModel={config?.local_model ?? null}
          cloudModel={config?.cloud_model ?? null}
        />
      </div>
    </DashboardLayout>
  )
}
