import type { ProjectPageViewModel } from '@/lib/data/project-page-view-model'
import { ProjectSectionShell, ProjectStatTile } from '@/app/projects/_components/project-detail-primitives'

interface ProjectValueSummaryCardProps {
  summary: ProjectPageViewModel
}

function formatCurrencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value)
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function ProjectValueSummaryCard({ summary }: ProjectValueSummaryCardProps) {
  const { valueSummary } = summary

  return (
    <ProjectSectionShell
      title="Value Summary"
      description={`${valueSummary.windowLabel} of successful Dyno requests.`}
      action={<p className="rounded-md border border-border/45 bg-background/35 px-2 py-1 text-[10px] text-muted-foreground/80">Estimate only</p>}
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <ProjectStatTile
          label="Total requests"
          value={valueSummary.totalRequests}
          valueClassName="text-[16px]"
          className="border-primary/20 bg-background/45"
        />
        <ProjectStatTile label="Local requests" value={valueSummary.localRequests} meta={formatPercentage(valueSummary.localPercentage)} />
        <ProjectStatTile
          label="Cloud requests"
          value={valueSummary.cloudRequests}
          meta={formatPercentage(1 - valueSummary.localPercentage)}
        />
        <ProjectStatTile label="Local percentage" value={formatPercentage(valueSummary.localPercentage)} />
        <ProjectStatTile
          label="Estimated cost avoided"
          value={formatCurrencyUsd(valueSummary.estimatedAvoidedCostUsd)}
          valueClassName="text-[13px]"
        />
        <ProjectStatTile
          label="Estimated cloud spend"
          value={formatCurrencyUsd(valueSummary.estimatedCloudCostUsd)}
          valueClassName="text-[13px]"
        />
      </div>

      <div className="mt-3 rounded-lg border border-border/45 bg-background/30 px-3 py-2.5">
        <div className="h-2 overflow-hidden rounded-full bg-muted/45" role="img" aria-label="Local to cloud execution distribution">
          <div className="h-full bg-primary/70" style={{ width: `${valueSummary.localPercentage * 100}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground/80">
          Local {valueSummary.localRequests} / Cloud {valueSummary.cloudRequests}
        </p>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/75">
        Estimated using {formatCurrencyUsd(valueSummary.estimatedCloudCostPerRequestUsd)} per request from project
        config (or default), not exact billing.
      </p>
    </ProjectSectionShell>
  )
}
