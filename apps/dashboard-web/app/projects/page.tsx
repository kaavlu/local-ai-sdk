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
import { Item, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemMedia, ItemTitle } from '@/components/ui/item'
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground tracking-tight">Projects</h1>
          <p className="mt-1 text-[12px] text-muted-foreground/80">
            Build and manage scoped SDK configuration surfaces for each use case.
          </p>
        </div>
        {workspace ? (
          <CreateProjectDialog
            action={createProjectAction}
            className="h-[32px] rounded-sm text-[11px] font-medium gap-1.5"
          />
        ) : (
          <Button className="h-[32px] rounded-sm text-[11px] font-medium gap-1.5" disabled>
            Create Project
          </Button>
        )}
      </div>

      {!workspace ? (
        <div className="max-w-3xl rounded-lg border border-border/40 bg-card p-5 animate-fade-in-up">
          <h2 className="text-[13px] font-semibold text-foreground">Workspace not found</h2>
          <p className="mt-1 text-[12px] text-muted-foreground/70">
            A workspace is required before creating projects.
          </p>
        </div>
      ) : projects.length === 0 ? (
        <div className="max-w-3xl rounded-lg border border-border/40 bg-card p-6 animate-fade-in-up">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/30 bg-muted/35">
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="text-[13px] font-semibold text-foreground">No projects yet</h2>
          <p className="mt-1 max-w-[520px] text-[12px] leading-relaxed text-muted-foreground/80">
            Projects define an SDK configuration surface for a specific use case, model strategy, and runtime policy.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <CreateProjectDialog
              action={createProjectAction}
              className="h-[32px] rounded-sm text-[11px] font-medium gap-1.5"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Each project can map to a distinct product flow or team-owned integration.
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl animate-fade-in-up">
          <ItemGroup className="gap-2">
            {projects.map((project) => (
              <Item
                key={project.id}
                asChild
                variant="outline"
                size="sm"
                className="rounded-lg border-border/40 bg-card"
              >
                <Link href={`/projects/${project.id}`}>
                  <ItemMedia variant="icon" className="border-border/40 bg-muted/35 text-muted-foreground">
                    <Layers3 className="h-3.5 w-3.5" />
                  </ItemMedia>
                  <ItemContent className="gap-1.5">
                    <ItemHeader className="gap-3">
                      <ItemTitle className="text-[13px] font-semibold text-foreground">
                        {project.name}
                      </ItemTitle>
                      <p className="text-[11px] text-muted-foreground/60">
                        {formatTimestamp(project.updated_at, project.created_at)}
                      </p>
                    </ItemHeader>
                    {project.description ? (
                      <ItemDescription className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground/80">
                        {project.description}
                      </ItemDescription>
                    ) : null}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="rounded-sm px-1.5 text-[10px] uppercase tracking-wide">
                        {toLabel(project.use_case_type)}
                      </Badge>
                      <Badge variant="outline" className="rounded-sm border-border/50 px-1.5 text-[10px]">
                        {toLabel(project.strategy_preset)}
                      </Badge>
                      <Badge
                        variant={project.status === 'active' ? 'default' : 'secondary'}
                        className="rounded-sm px-1.5 text-[10px] capitalize"
                      >
                        {project.status}
                      </Badge>
                    </div>
                  </ItemContent>
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/60" />
                </Link>
              </Item>
            ))}
          </ItemGroup>
        </div>
      )}
    </DashboardLayout>
  )
}
