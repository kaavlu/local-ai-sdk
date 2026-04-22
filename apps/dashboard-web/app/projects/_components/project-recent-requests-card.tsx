import { Badge } from '@/components/ui/badge'
import {
  ProjectInsetPanel,
  ProjectSectionShell,
  ProjectStatusBadge,
} from '@/app/projects/_components/project-detail-primitives'
import { cn } from '@/lib/utils'
import type { ProjectRequestExecution } from '@/lib/data/dashboard-types'

interface ProjectRecentRequestsCardProps {
  requests: ProjectRequestExecution[]
  hasRecentFailures: boolean
  className?: string
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

function formatLatencyMs(value: number | null): string {
  if (value == null) {
    return '—'
  }
  return `${value} ms`
}

function formatStatusText(request: ProjectRequestExecution): string {
  if (request.status === 'success') {
    return 'Success'
  }
  return 'Error'
}

export function ProjectRecentRequestsCard({
  requests,
  hasRecentFailures,
  className,
}: ProjectRecentRequestsCardProps) {
  return (
    <ProjectSectionShell
      title="Recent Requests"
      description="Latest request outcomes for this project."
      className={cn(className)}
      action={
        hasRecentFailures ? (
          <ProjectStatusBadge tone="error">Errors detected</ProjectStatusBadge>
        ) : (
          <ProjectStatusBadge tone="success">Healthy</ProjectStatusBadge>
        )
      }
    >
      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-background/30 px-3 py-4">
          <p className="text-[11px] text-muted-foreground/80">
            No requests yet. Use the Request Tester or your app integration to send a first request.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            Request history appears here after the first successful or failed call.
          </p>
        </div>
      ) : (
        <ProjectInsetPanel className="p-1.5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-[11px]">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[20%]" />
                <col className="w-[17%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border/45 text-muted-foreground/80">
                  <th className="px-2 py-2 font-medium">Time</th>
                  <th className="px-2 py-2 font-medium">Endpoint</th>
                  <th className="px-2 py-2 font-medium">Path</th>
                  <th className="px-2 py-2 font-medium">Reason</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-b border-border/25 align-top last:border-b-0">
                    <td className="px-2 py-2 text-muted-foreground/90">{formatTimestamp(request.created_at)}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-foreground" title={request.endpoint}>
                      <span className="block truncate">{request.endpoint}</span>
                    </td>
                    <td className="px-2 py-2">
                      <Badge
                        variant={request.execution_path === 'cloud' ? 'outline' : 'secondary'}
                        className="rounded-md px-1.5 text-[10px] capitalize"
                      >
                        {request.execution_path ?? 'unknown'}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground/90" title={request.execution_reason ?? '—'}>
                      <span className="block truncate">{request.execution_reason ?? '—'}</span>
                    </td>
                    <td className="px-2 py-2">
                      <Badge
                        variant={request.status === 'success' ? 'secondary' : 'destructive'}
                        className="rounded-md px-1.5 text-[10px]"
                      >
                        {formatStatusText(request)}
                      </Badge>
                      {request.status === 'error' && request.error_code ? (
                        <p className="mt-1 truncate text-[10px] text-muted-foreground/85" title={request.error_code}>
                          {request.error_code}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground/90">
                      <span className="block">{formatLatencyMs(request.latency_ms)}</span>
                      {request.http_status != null ? (
                        <span className="block text-[10px] text-muted-foreground/80">HTTP {request.http_status}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ProjectInsetPanel>
      )}
    </ProjectSectionShell>
  )
}
