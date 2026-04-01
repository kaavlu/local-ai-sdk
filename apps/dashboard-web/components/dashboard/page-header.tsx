interface PageHeaderProps {
  title: string
  description?: string
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-[15px] font-semibold text-foreground tracking-tight">{title}</h1>
      {description && (
        <p className="text-[12px] text-muted-foreground/80 mt-1">{description}</p>
      )}
    </div>
  )
}
