import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[380px] py-12 animate-fade-in-up">
      <div className="w-12 h-12 rounded-lg bg-muted/40 flex items-center justify-center mb-4 border border-border/30">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <h3 className="text-[13px] font-semibold text-foreground mb-1.5">{title}</h3>
      <p className="text-[12px] text-muted-foreground/80 text-center max-w-[260px] leading-relaxed">
        {description}
      </p>
    </div>
  )
}
