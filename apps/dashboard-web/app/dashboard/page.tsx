import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { PageHeader } from '@/components/dashboard/page-header'
import { getCurrentWorkspace, listProjects } from '@/lib/data/dashboard-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowUpRight, FolderKanban } from 'lucide-react'

function toLabel(value: string) {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function formatUpdatedAt(updatedAt: string, createdAt: string) {
  const date = new Date(updatedAt || createdAt)
  if (Number.isNaN(date.getTime())) {
    return 'Recently updated'
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  const workspace = await getCurrentWorkspace()
  const projects = workspace ? await listProjects(workspace.id) : []

  const totalProjects = projects.length
  const activeProjects = projects.filter((project) => project.status === 'active').length
  const draftProjects = projects.filter((project) => project.status === 'draft').length
  const localFirstProjects = projects.filter((project) => project.strategy_preset === 'local_first').length
  const recentProjects = projects.slice(0, 6)

  return (
    <DashboardLayout userEmail={user.email}>
      <PageHeader
        title="Overview"
        description="Manage project-level inference configurations and local execution behavior."
      />

      {!workspace ? (
        <div className="max-w-3xl rounded-lg border border-border/40 bg-card p-5 animate-fade-in-up">
          <h2 className="text-[13px] font-semibold text-foreground">Workspace not found</h2>
          <p className="mt-1 text-[12px] text-muted-foreground/75">
            A workspace is required before using the control center.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Button asChild className="h-[31px] rounded-sm px-3 text-[11px] font-medium">
              <Link href="/settings">View Settings</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in-up">
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/40 bg-card px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Total Projects</p>
              <p className="mt-1 text-[21px] font-semibold leading-none text-foreground">{totalProjects}</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-card px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Active Projects</p>
              <p className="mt-1 text-[21px] font-semibold leading-none text-foreground">{activeProjects}</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-card px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Draft Projects</p>
              <p className="mt-1 text-[21px] font-semibold leading-none text-foreground">{draftProjects}</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-card px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Local-First Projects</p>
              <p className="mt-1 text-[21px] font-semibold leading-none text-foreground">{localFirstProjects}</p>
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_290px]">
            <section className="rounded-lg border border-border/40 bg-card">
              <div className="flex items-center justify-between border-b border-border/35 px-4 py-3">
                <div>
                  <h2 className="text-[13px] font-semibold text-foreground">Recent Projects</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    Latest project surfaces in this workspace.
                  </p>
                </div>
                <Button asChild variant="ghost" className="h-[28px] rounded-sm px-2 text-[11px]">
                  <Link href="/projects">View all</Link>
                </Button>
              </div>

              {recentProjects.length === 0 ? (
                <div className="px-4 py-7">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/35 bg-muted/25">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="mt-3 text-[13px] font-semibold text-foreground">No projects yet</h3>
                  <p className="mt-1 max-w-[560px] text-[12px] leading-relaxed text-muted-foreground/75">
                    Projects are the core unit for routing and runtime configuration. Create one to start controlling
                    local and cloud execution behavior.
                  </p>
                  <div className="mt-4">
                    <Button asChild className="h-[31px] rounded-sm px-3 text-[11px] font-medium">
                      <Link href="/projects">Create Project</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {recentProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="group grid gap-2 px-4 py-3 transition-colors hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_max-content]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-foreground">{project.name}</p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground/70">
                          {toLabel(project.use_case_type)} · {toLabel(project.strategy_preset)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 justify-self-start sm:justify-self-end">
                        <Badge
                          variant={project.status === 'active' ? 'default' : 'secondary'}
                          className="rounded-sm px-1.5 text-[10px] capitalize"
                        >
                          {project.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground/65">
                          {formatUpdatedAt(project.updated_at, project.created_at)}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/45 transition-colors group-hover:text-muted-foreground/80" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-3">
              <section className="rounded-lg border border-border/40 bg-card p-4">
                <h2 className="text-[13px] font-semibold text-foreground">Quick Actions</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/75">
                  Keep project configuration and integration flow moving.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <Button asChild className="h-[31px] justify-start rounded-sm px-3 text-[11px] font-medium">
                    <Link href="/projects">Create Project</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-[31px] justify-start rounded-sm px-3 text-[11px]">
                    <Link href="/projects">Open Projects</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-[31px] justify-start rounded-sm px-3 text-[11px]">
                    <Link href="/settings">View Settings</Link>
                  </Button>
                </div>
              </section>

              <section className="rounded-lg border border-border/40 bg-card p-4">
                <h3 className="text-[12px] font-semibold text-foreground">Next Steps</h3>
                <ul className="mt-2 space-y-1.5 text-[11px] text-muted-foreground/75">
                  <li>Create a project for a product use case.</li>
                  <li>Configure local and cloud routing behavior.</li>
                  <li>Use the project ID in your SDK integration.</li>
                </ul>
              </section>
            </aside>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
