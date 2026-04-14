import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createProject, getCurrentWorkspace, listProjects } from '@/lib/data/dashboard-data'
import type { StrategyPreset, UseCaseType } from '@/lib/data/dashboard-types'
import { SUPPORTED_USE_CASES, isSupportedUseCase } from '@/lib/data/supported-use-cases'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreateProjectDialog } from '@/app/projects/_components/create-project-dialog'
import { ArrowUpRight, FolderKanban, Layers3 } from 'lucide-react'

function toLabel(value: string) {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function formatTimestamp(updatedAt: string, createdAt: string) {
  const date = new Date(updatedAt || createdAt)
  if (Number.isNaN(date.getTime())) {
    return 'Updated recently'
  }

  return `Updated ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

function toStatusLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  const workspace = await getCurrentWorkspace()
  const projects = workspace ? await listProjects(workspace.id) : []
  const useCaseValues: UseCaseType[] = [...SUPPORTED_USE_CASES]
  const strategyValues: StrategyPreset[] = ['local_first', 'balanced', 'cloud_first']

  async function createProjectAction(
    _: {
      status: 'idle' | 'success' | 'error'
      message?: string
      fieldErrors?: {
        name?: string
        useCaseType?: string
        strategyPreset?: string
      }
    },
    formData: FormData,
  ) {
    'use server'

    if (!workspace) {
      return {
        status: 'error' as const,
        message: 'Workspace is required before creating projects.',
      }
    }

    const name = String(formData.get('name') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const useCaseTypeValue = String(formData.get('useCaseType') ?? '').trim()
    const strategyPresetValue = String(formData.get('strategyPreset') ?? '').trim()

    const fieldErrors: {
      name?: string
      useCaseType?: string
      strategyPreset?: string
    } = {}

    if (!name) {
      fieldErrors.name = 'Project name is required.'
    }
    if (!useCaseTypeValue || !isSupportedUseCase(useCaseTypeValue) || !useCaseValues.includes(useCaseTypeValue)) {
      fieldErrors.useCaseType = 'Select a use case.'
    }
    if (!strategyPresetValue || !strategyValues.includes(strategyPresetValue as StrategyPreset)) {
      fieldErrors.strategyPreset = 'Select a strategy.'
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        status: 'error' as const,
        fieldErrors,
      }
    }

    try {
      await createProject({
        workspaceId: workspace.id,
        name,
        description: description || null,
        useCaseType: useCaseTypeValue as UseCaseType,
        strategyPreset: strategyPresetValue as StrategyPreset,
      })
      revalidatePath('/projects')

      return {
        status: 'success' as const,
      }
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Failed to create project.',
      }
    }
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <section className="mb-5 rounded-xl border border-border/50 bg-card/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">Workspace Projects</p>
            <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-foreground">Projects</h1>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground/80">
              Build and manage scoped SDK configuration surfaces for each use case.
            </p>
          </div>
          {workspace ? (
            <CreateProjectDialog
              action={createProjectAction}
              className="h-8 rounded-md text-[11px] font-medium gap-1.5"
            />
          ) : (
            <Button className="h-8 rounded-md text-[11px] font-medium gap-1.5" disabled>
              Create Project
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-2 text-[11px] text-muted-foreground/80 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-border/45 bg-background/35 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Total projects</p>
            <p className="mt-1 text-[14px] font-semibold leading-none text-foreground">{projects.length}</p>
          </div>
          <div className="rounded-lg border border-border/45 bg-background/35 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Active</p>
            <p className="mt-1 text-[14px] font-semibold leading-none text-foreground">
              {projects.filter((project) => project.status === 'active').length}
            </p>
          </div>
          <div className="rounded-lg border border-border/45 bg-background/35 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Draft</p>
            <p className="mt-1 text-[14px] font-semibold leading-none text-foreground">
              {projects.filter((project) => project.status !== 'active').length}
            </p>
          </div>
        </div>
      </section>

      {!workspace ? (
        <div className="max-w-3xl rounded-xl border border-border/45 bg-card/95 p-5">
          <h2 className="text-[13px] font-semibold text-foreground">Workspace not found</h2>
          <p className="mt-1 text-[12px] text-muted-foreground/70">
            A workspace is required before creating projects.
          </p>
        </div>
      ) : projects.length === 0 ? (
        <div className="max-w-3xl rounded-xl border border-border/45 bg-card/95 p-6">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/35 bg-muted/35">
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="text-[13px] font-semibold text-foreground">No projects yet</h2>
          <p className="mt-1 max-w-[520px] text-[12px] leading-relaxed text-muted-foreground/80">
            Build and manage scoped SDK configuration surfaces for each use case.
          </p>
          <p className="mt-1 max-w-[520px] text-[12px] leading-relaxed text-muted-foreground/80">
            Projects define an SDK configuration surface for a specific use case, model strategy, and runtime policy.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <CreateProjectDialog
              action={createProjectAction}
              className="h-8 rounded-md text-[11px] font-medium gap-1.5"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Each project can map to a distinct product flow or team-owned integration.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const isActive = project.status === 'active'
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-xl border border-border/45 bg-card/95 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-border/65 hover:bg-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                        isActive
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-border/50 bg-muted/35 text-muted-foreground'
                      }`}
                    >
                      <Layers3 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground">{project.name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-muted-foreground/60'}`}
                        />
                        <Badge
                          variant={isActive ? 'secondary' : 'outline'}
                          className={`rounded-md px-1.5 py-0 text-[10px] ${isActive ? 'text-emerald-100/95 bg-emerald-500/20 border-emerald-400/30' : 'border-border/50 text-muted-foreground/90'}`}
                        >
                          {toStatusLabel(project.status)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                </div>

                {project.description ? (
                  <p className="mt-3 line-clamp-2 min-h-[2.65rem] text-[12px] leading-relaxed text-muted-foreground/82">
                    {project.description}
                  </p>
                ) : (
                  <p className="mt-3 min-h-[2.65rem] text-[12px] text-muted-foreground/55">No description provided.</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="rounded-md border border-border/45 bg-background/55 px-1.5 py-0 text-[10px] uppercase tracking-wide text-foreground/90"
                  >
                    {toLabel(project.use_case_type)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-md border-border/55 bg-background/40 px-1.5 py-0 text-[10px] text-muted-foreground/95"
                  >
                    {toLabel(project.strategy_preset)}
                  </Badge>
                </div>

                <div className="mt-3 border-t border-border/35 pt-2">
                  <p className="text-[10px] text-muted-foreground/65">{formatTimestamp(project.updated_at, project.created_at)}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </DashboardLayout>
  )
}
