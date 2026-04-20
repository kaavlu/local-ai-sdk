import { Badge } from '@/components/ui/badge'
import { ProjectSectionShell, ProjectStatTile } from '@/app/projects/_components/project-detail-primitives'
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
  const { health, guidance, config } = summary

  return (
    <ProjectSectionShell
      title="Setup & Health"
      description="Quick status for configuration/auth readiness. Operational local-first outcomes are shown in the Local-first Signals card."
      action={
        <Badge
          variant={health.readyForRequests ? 'secondary' : 'destructive'}
          className="rounded-md px-2 py-0.5 text-[10px]"
        >
          {health.readyForRequests ? 'Ready for requests' : 'Setup needed'}
        </Badge>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectStatTile label="Fallback configured" value={formatStatusText(health.fallbackConfigured)} />
        <ProjectStatTile
          label="Upstream API key configured"
          value={formatStatusText(health.upstreamApiKeyConfigured)}
        />
        <ProjectStatTile label="Active Dyno API keys" value={health.activeApiKeyCount} />
        <ProjectStatTile
          label="Recent success rate"
          value={
            health.recentRequestCount > 0
              ? `${Math.round((health.recentSuccessCount / health.recentRequestCount) * 100)}%`
              : '—'
          }
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectStatTile
          label="Recent requests"
          value={health.recentRequestCount > 0 ? health.recentRequestCount : 'No requests yet'}
          valueClassName="text-[13px]"
        />
        <ProjectStatTile
          label="Last request status"
          value={health.lastRequest ? (health.lastRequest.status === 'success' ? 'Success' : 'Error') : '—'}
          className="border-border/50"
        />
        <ProjectStatTile
          label="Last execution path"
          value={<span className="capitalize">{health.lastRequest?.executionPath ?? '—'}</span>}
        />
        <ProjectStatTile
          label="Last request time"
          value={health.lastRequest ? formatDate(health.lastRequest.createdAt) : '—'}
          valueClassName="text-[12px] leading-tight"
        />
      </div>

      <div className="mt-3 rounded-lg border border-border/45 bg-background/30 px-3 py-2.5">
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
            Setup is ready. Use the SDK integration snippet below to initialize Dyno and send your first request. Runtime lifecycle is managed by the SDK by default. Use the OpenAI-compatible snippet only for hosted compatibility testing.
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
    </ProjectSectionShell>
  )
}
