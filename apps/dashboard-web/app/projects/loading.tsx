import { DashboardLayout } from '@/components/dashboard/dashboard-layout'

export default function ProjectsLoading() {
  return (
    <DashboardLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded-sm bg-muted/50" />
          <div className="h-3 w-64 animate-pulse rounded-sm bg-muted/40" />
        </div>
        <div className="h-[32px] w-28 animate-pulse rounded-sm bg-muted/45" />
      </div>

      <div className="max-w-4xl space-y-2 animate-fade-in-up">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`project-loading-row-${index}`}
            className="rounded-lg border border-border/40 bg-card px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="h-3.5 w-32 animate-pulse rounded-sm bg-muted/50" />
              <div className="h-3 w-24 animate-pulse rounded-sm bg-muted/35" />
            </div>
            <div className="mt-2 h-3 w-72 animate-pulse rounded-sm bg-muted/35" />
            <div className="mt-2 flex gap-2">
              <div className="h-5 w-24 animate-pulse rounded-sm bg-muted/45" />
              <div className="h-5 w-20 animate-pulse rounded-sm bg-muted/35" />
              <div className="h-5 w-14 animate-pulse rounded-sm bg-muted/35" />
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  )
}
