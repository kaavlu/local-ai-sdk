import type { ReactNode } from 'react'
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
    <section
      className={cn(
        'rounded-xl border border-border/50 bg-card/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
        className,
      )}
    >
      <div className={cn('mb-4 flex items-start justify-between gap-3', headerClassName)}>
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-[11px] text-muted-foreground/80">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
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
    <div
      className={cn(
        'rounded-lg border border-border/45 bg-background/35 px-3 py-2.5',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
        className,
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75">{label}</p>
      <p className={cn('mt-1 text-[14px] font-semibold leading-none text-foreground', valueClassName)}>{value}</p>
      {meta ? <p className="mt-1 text-[10px] text-muted-foreground/80">{meta}</p> : null}
    </div>
  )
}
