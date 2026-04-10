import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { PageHeader } from '@/components/dashboard/page-header'

export default function SettingsLoading() {
  return (
    <DashboardLayout>
      <PageHeader title="Settings" description="Manage workspace and profile settings." />

      <div className="max-w-3xl space-y-4 animate-fade-in-up">
        <div className="rounded-lg border border-border/40 bg-card p-4">
          <div className="mb-3 h-3 w-28 rounded bg-muted/40" />
          <div className="space-y-2">
            <div className="h-8 rounded-sm bg-muted/25" />
            <div className="h-8 w-28 rounded-sm bg-muted/25" />
          </div>
        </div>
        <div className="rounded-lg border border-border/40 bg-card p-4">
          <div className="mb-3 h-3 w-24 rounded bg-muted/40" />
          <div className="space-y-2">
            <div className="h-8 rounded-sm bg-muted/25" />
            <div className="h-8 rounded-sm bg-muted/25" />
            <div className="h-8 w-24 rounded-sm bg-muted/25" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
