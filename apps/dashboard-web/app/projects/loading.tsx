import { DashboardLayout } from '@/components/dashboard/dashboard-layout'

export default function ProjectsLoading() {
  return (
    <DashboardLayout>
      <section className="mb-5 rounded-xl border border-border/50 bg-card/95 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded-sm bg-muted/45" />
            <div className="h-6 w-32 animate-pulse rounded-sm bg-muted/50" />
            <div className="h-3 w-72 animate-pulse rounded-sm bg-muted/40" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-md bg-muted/45" />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-14 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-14 animate-pulse rounded-lg bg-muted/25" />
          <div className="h-14 animate-pulse rounded-lg bg-muted/25" />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`project-loading-row-${index}`}
            className="rounded-xl border border-border/45 bg-card/95 p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 animate-pulse rounded-md bg-muted/35" />
                <div className="space-y-2">
                  <div className="h-3.5 w-28 animate-pulse rounded-sm bg-muted/50" />
                  <div className="h-3 w-16 animate-pulse rounded-sm bg-muted/35" />
                </div>
              </div>
              <div className="h-3.5 w-3.5 animate-pulse rounded-sm bg-muted/35" />
            </div>
            <div className="mt-3 h-10 animate-pulse rounded-sm bg-muted/30" />
            <div className="mt-3 flex gap-2">
              <div className="h-5 w-24 animate-pulse rounded-md bg-muted/40" />
              <div className="h-5 w-20 animate-pulse rounded-md bg-muted/30" />
            </div>
            <div className="mt-3 h-3 w-32 animate-pulse rounded-sm bg-muted/30" />
          </div>
        ))}
      </div>
    </DashboardLayout>
  )
}
