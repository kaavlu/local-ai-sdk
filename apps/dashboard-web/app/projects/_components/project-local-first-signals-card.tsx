import { Badge } from '@/components/ui/badge'
import { ProjectSectionShell, ProjectStatTile } from '@/app/projects/_components/project-detail-primitives'
import type { ProjectPageViewModel } from '@/lib/data/project-page-view-model'

interface ProjectLocalFirstSignalsCardProps {
  summary: ProjectPageViewModel
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatTrendDirection(value: ProjectPageViewModel['operationalSignals']['reliabilitySummary']['direction']) {
  if (value === 'improving') return 'Improving'
  if (value === 'degrading') return 'Degrading'
  if (value === 'stable') return 'Stable'
  return 'Insufficient data'
}

function formatConfidence(value: ProjectPageViewModel['operationalSignals']['confidence']['level']) {
  if (value === 'high') return 'High'
  if (value === 'medium') return 'Medium'
  return 'Low'
}

export function ProjectLocalFirstSignalsCard({ summary }: ProjectLocalFirstSignalsCardProps) {
  const { operationalSignals, pilotProofPack } = summary

  return (
    <ProjectSectionShell
      title="Local-first Signals"
      description="Operational outcomes from recent telemetry plus pilot proof-pack exports (JSON/CSV/Markdown) for weekly reviews."
      action={
        <Badge variant="outline" className="rounded-md border-border/55 px-2 py-0.5 text-[10px]">
          {operationalSignals.windowLabel}
        </Badge>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <ProjectStatTile
          label="Directional local hit rate"
          value={formatPercent(operationalSignals.localHitRate)}
          meta={`Sample: ${operationalSignals.localHitRateSampleSize} successful local/cloud executions (${formatConfidence(operationalSignals.confidence.level)} confidence)`}
        />
        <ProjectStatTile
          label="Latest error rate"
          value={formatPercent(operationalSignals.reliabilitySummary.latestErrorRate)}
          meta={`Trend: ${formatTrendDirection(operationalSignals.reliabilitySummary.direction)}`}
        />
        <ProjectStatTile
          label="Proof-pack schema"
          value={pilotProofPack.kpis.schemaVersion}
          meta="Export-ready KPI shape for pilot value reviews"
        />
      </div>

      <div className="mt-3 rounded-lg border border-border/45 bg-background/30 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Fallback reason distribution</p>
        {operationalSignals.fallbackReasonBuckets.length > 0 ? (
          <div className="mt-2 space-y-2">
            {operationalSignals.fallbackReasonBuckets.slice(0, 4).map((bucket) => (
              <div key={bucket.key}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground/90">{bucket.label}</span>
                  <span className="text-muted-foreground/85">
                    {bucket.count} ({formatPercent(bucket.share)})
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: `${Math.max(4, Math.round(bucket.share * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground/85">
            No cloud fallback executions captured in this window.
          </p>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-border/45 bg-background/30 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Reliability trend</p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {operationalSignals.reliabilityTrend.map((point) => (
            <div key={point.label} className="rounded-md border border-border/35 bg-background/40 px-1.5 py-1">
              <p className="text-[9px] text-muted-foreground/70">{point.label}</p>
              <p className="mt-1 text-[11px] font-medium text-foreground/90">{formatPercent(point.errorRate)}</p>
              <p className="text-[9px] text-muted-foreground/70">
                {point.errorCount} err / {point.timeoutCount} timeout
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border/45 bg-background/30 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">Pilot proof-pack export</p>
        <p className="mt-1 text-[11px] text-foreground/90">
          Includes aligned KPI exports in JSON/CSV/Markdown with confidence and caveat semantics.
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/80">
          Confidence thresholds: medium {operationalSignals.confidence.mediumThreshold}+ and high{' '}
          {operationalSignals.confidence.highThreshold}+ successful local/cloud executions.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md border border-border/35 bg-background/50 p-2 text-[10px] leading-relaxed text-muted-foreground/90">
          {pilotProofPack.exports.markdown.split('\n').slice(0, 6).join('\n')}
        </pre>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/72">{operationalSignals.directionalCaveat}</p>
    </ProjectSectionShell>
  )
}
