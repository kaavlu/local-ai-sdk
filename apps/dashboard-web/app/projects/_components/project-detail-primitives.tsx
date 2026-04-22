import type { ReactNode } from 'react'
import {
  DashboardInlineCallout,
  DashboardInsetPanel,
  DashboardMetadataItem,
  DashboardMetadataRow,
  DashboardSectionCard,
  DashboardStatusBadge,
} from '@/components/dashboard/surface-primitives'
import { cn } from '@/lib/utils'

interface ProjectSectionShellProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
  children: ReactNode
  headerClassName?: string
}

export function ProjectSectionShell({
  title,
  description,
  action,
  className,
  children,
  headerClassName,
}: ProjectSectionShellProps) {
  return (
    <DashboardSectionCard
      title={title}
      description={description}
      action={action}
      className={className}
      headerClassName={headerClassName}
    >
      {children}
    </DashboardSectionCard>
  )
}

interface ProjectStatTileProps {
  label: string
  value: ReactNode
  meta?: ReactNode
  className?: string
  valueClassName?: string
}

export function ProjectStatTile({
  label,
  value,
  meta,
  className,
  valueClassName,
}: ProjectStatTileProps) {
  return (
    <div className={cn('rounded-md border border-border/50 bg-background/30 px-3 py-2', className)}>
      <p className="text-[11px] text-muted-foreground/80">{label}</p>
      <p className={cn('mt-1 text-base font-semibold leading-tight text-foreground', valueClassName)}>{value}</p>
      {meta ? <p className="mt-1 text-xs text-muted-foreground/80">{meta}</p> : null}
    </div>
  )
}

interface ProjectInsetPanelProps {
  children: ReactNode
  className?: string
}

export function ProjectInsetPanel({ children, className }: ProjectInsetPanelProps) {
  return <DashboardInsetPanel className={className}>{children}</DashboardInsetPanel>
}

interface ProjectStatusBadgeProps {
  tone: 'neutral' | 'success' | 'warning' | 'error'
  children: ReactNode
  className?: string
}

export function ProjectStatusBadge({ tone, children, className }: ProjectStatusBadgeProps) {
  return <DashboardStatusBadge tone={tone} className={className}>{children}</DashboardStatusBadge>
}

interface ProjectInlineAlertProps {
  tone?: 'neutral' | 'success' | 'warning' | 'error'
  title?: string
  children: ReactNode
  className?: string
}

export function ProjectInlineAlert({
  tone = 'neutral',
  title,
  children,
  className,
}: ProjectInlineAlertProps) {
  return (
    <DashboardInlineCallout tone={tone} title={title} className={className}>
      {children}
    </DashboardInlineCallout>
  )
}

export { DashboardMetadataItem as ProjectMetadataItem, DashboardMetadataRow as ProjectMetadataRow }
