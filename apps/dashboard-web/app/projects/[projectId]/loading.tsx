import { DashboardLayout } from '@/components/dashboard/dashboard-layout'

export default function ProjectDetailLoading() {
  return (
    <DashboardLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-48 animate-pulse rounded-sm bg-muted/50" />
          <div className="h-3 w-80 animate-pulse rounded-sm bg-muted/35" />
        </div>
        <div className="h-8 w-28 animate-pulse rounded-sm bg-muted/40" />
      </div>

      <div className="max-w-3xl space-y-3 animate-fade-in-up">
        <div className="rounded-lg border border-border/40 bg-card p-5">
          <div className="flex gap-2">
            <div className="h-5 w-28 animate-pulse rounded-sm bg-muted/45" />
            <div className="h-5 w-24 animate-pulse rounded-sm bg-muted/35" />
            <div className="h-5 w-16 animate-pulse rounded-sm bg-muted/35" />
          </div>
        </div>
        <div className="rounded-lg border border-border/40 bg-card p-5">
          <div className="h-3.5 w-24 animate-pulse rounded-sm bg-muted/45" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`project-config-loading-${index}`}
                className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2"
              >
                <div className="h-2.5 w-24 animate-pulse rounded-sm bg-muted/35" />
                <div className="mt-1.5 h-3 w-20 animate-pulse rounded-sm bg-muted/45" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border/40 bg-card p-5">
          <div className="h-3.5 w-20 animate-pulse rounded-sm bg-muted/45" />
          <div className="mt-1.5 h-2.5 w-40 animate-pulse rounded-sm bg-muted/35" />
          <div className="mt-3 rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
            <div className="h-2.5 w-20 animate-pulse rounded-sm bg-muted/35" />
            <div className="mt-1.5 h-3 w-64 animate-pulse rounded-sm bg-muted/45" />
          </div>
          <div className="mt-2 rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
            <div className="h-16 w-full animate-pulse rounded-sm bg-muted/35" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
