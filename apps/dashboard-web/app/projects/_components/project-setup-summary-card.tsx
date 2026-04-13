import { Badge } from '@/components/ui/badge'
import type { ProjectPageViewModel } from '@/lib/data/project-page-view-model'

interface ProjectSetupSummaryCardProps {
  summary: ProjectPageViewModel
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function formatStatusText(value: boolean, positive = 'Yes', negative = 'No'): string {
  return value ? positive : negative
}

export function ProjectSetupSummaryCard({ summary }: ProjectSetupSummaryCardProps) {
  const { health, guidance, integration, config } = summary

  return (
    <section className="rounded-lg border border-border/40 bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-semibold text-foreground">Setup & Health</h2>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            Quick status for configuration, auth, and recent execution behavior.
          </p>
        </div>
        <Badge
          variant={health.readyForRequests ? 'secondary' : 'destructive'}
          className="rounded-sm px-1.5 text-[10px]"
        >
          {health.readyForRequests ? 'Ready for requests' : 'Setup needed'}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground/75">Fallback configured</p>
          <p className="text-[11px] font-medium text-foreground">{formatStatusText(health.fallbackConfigured)}</p>
        </div>
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground/75">Upstream API key configured</p>
          <p className="text-[11px] font-medium text-foreground">
            {formatStatusText(health.upstreamApiKeyConfigured)}
          </p>
        </div>
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground/75">Active Dyno API keys</p>
          <p className="text-[11px] font-medium text-foreground">{health.activeApiKeyCount}</p>
        </div>
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground/75">Logical model</p>
          <p className="truncate font-mono text-[11px] text-foreground" title={integration.logicalModel}>
            {integration.logicalModel}
          </p>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground/75">Recent requests</p>
          <p className="text-[11px] font-medium text-foreground">
            {health.recentRequestCount > 0 ? health.recentRequestCount : 'No requests yet'}
          </p>
        </div>
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground/75">Last request status</p>
          <p className="text-[11px] font-medium text-foreground">
            {health.lastRequest ? (health.lastRequest.status === 'success' ? 'Success' : 'Error') : '—'}
          </p>
        </div>
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground/75">Last execution path</p>
          <p className="text-[11px] font-medium capitalize text-foreground">
            {health.lastRequest?.executionPath ?? '—'}
          </p>
        </div>
        <div className="rounded-sm border border-border/40 bg-background/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground/75">Last request time</p>
          <p className="text-[11px] font-medium text-foreground">
            {health.lastRequest ? formatDate(health.lastRequest.createdAt) : '—'}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-sm border border-border/40 bg-background/25 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Next step</p>
        {guidance.needsFallbackSetup ? (
          <p className="mt-1 text-[11px] text-foreground/90">
            Cloud fallback is enabled but incomplete. Add an upstream base URL and model in Runtime Configuration.
          </p>
        ) : guidance.needsDynoApiKey ? (
          <p className="mt-1 text-[11px] text-foreground/90">
            No Dyno API key exists yet. Create one below before sending authenticated requests.
          </p>
        ) : guidance.hasRecentFailures ? (
          <p className="mt-1 text-[11px] text-foreground/90">
            Recent errors detected. Check the latest request entries for execution path and status details.
          </p>
        ) : guidance.hasNoRequests ? (
          <p className="mt-1 text-[11px] text-foreground/90">
            Setup is ready. Use the Integration snippet below to send your first request.
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-foreground/90">
            Dyno is configured and receiving traffic for this project.
          </p>
        )}
        {config?.fallback_enabled ? (
          <p className="mt-1 text-[10px] text-muted-foreground/80">
            Recent path split: local {health.localExecutionCount} / cloud {health.cloudExecutionCount}.
          </p>
        ) : null}
      </div>
    </section>
  )
}
