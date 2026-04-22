import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface DashboardPageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  action?: ReactNode
  className?: string
  children?: ReactNode
}

export function DashboardPageHeader({
  title,
  description,
  eyebrow,
  action,
  className,
  children,
}: DashboardPageHeaderProps) {
  return (
    <header className={cn('rounded-lg border border-border/60 bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[11px] text-muted-foreground/75">{eyebrow}</p> : null}
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground/85">{description}</p> : null}
        </div>
        {action}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </header>
  )
}

interface DashboardSectionCardProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
  children: ReactNode
  headerClassName?: string
}

export function DashboardSectionCard({
  title,
  description,
  action,
  className,
  children,
  headerClassName,
}: DashboardSectionCardProps) {
  return (
    <section className={cn('rounded-lg border border-border/60 bg-card p-4', className)}>
      <div className={cn('mb-3 flex items-start justify-between gap-2', headerClassName)}>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted-foreground/85">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

interface DashboardInsetPanelProps {
  children: ReactNode
  className?: string
}

export function DashboardInsetPanel({ children, className }: DashboardInsetPanelProps) {
  return <div className={cn('rounded-md border border-border/50 bg-background/30 p-3', className)}>{children}</div>
}

type DashboardTone = 'neutral' | 'success' | 'warning' | 'error'

interface DashboardStatusBadgeProps {
  tone: DashboardTone
  children: ReactNode
  className?: string
}

export function DashboardStatusBadge({ tone, children, className }: DashboardStatusBadgeProps) {
  const variant =
    tone === 'success'
      ? 'success'
      : tone === 'warning'
        ? 'warning'
        : tone === 'error'
          ? 'error'
          : 'neutral'

  return (
    <Badge variant={variant} size="compact" className={cn(className)}>
      {children}
    </Badge>
  )
}

interface DashboardInlineCalloutProps {
  tone?: DashboardTone
  title?: string
  children: ReactNode
  className?: string
}

export function DashboardInlineCallout({
  tone = 'neutral',
  title,
  children,
  className,
}: DashboardInlineCalloutProps) {
  const toneClassName =
    tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : tone === 'warning'
        ? 'border-amber-500/35 bg-amber-500/10'
        : tone === 'error'
          ? 'border-destructive/35 bg-destructive/10'
          : 'border-border/55 bg-background/35'
  const titleClassName =
    tone === 'error'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-100'
        : 'text-foreground'

  return (
    <div className={cn('rounded-md border px-3 py-2', toneClassName, className)}>
      {title ? <p className={cn('text-xs font-medium', titleClassName)}>{title}</p> : null}
      <div className={cn(title ? 'mt-1 text-xs text-muted-foreground/90' : 'text-xs text-muted-foreground/90')}>
        {children}
      </div>
    </div>
  )
}

interface DashboardMetadataRowProps {
  children: ReactNode
  className?: string
}

export function DashboardMetadataRow({ children, className }: DashboardMetadataRowProps) {
  return <div className={cn('grid gap-2 sm:grid-cols-3', className)}>{children}</div>
}

interface DashboardMetadataItemProps {
  label: string
  value: ReactNode
  meta?: ReactNode
  className?: string
}

export function DashboardMetadataItem({
  label,
  value,
  meta,
  className,
}: DashboardMetadataItemProps) {
  return (
    <DashboardInsetPanel className={cn('p-2.5', className)}>
      <p className="text-[11px] text-muted-foreground/80">{label}</p>
      <div className="mt-1">{value}</div>
      {meta ? <p className="mt-1 text-xs text-muted-foreground/80">{meta}</p> : null}
    </DashboardInsetPanel>
  )
}
