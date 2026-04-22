import type { ReactNode } from 'react'
import { DashboardPageHeader } from '@/components/dashboard/surface-primitives'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  eyebrow?: string
}

export function PageHeader({ title, description, action, eyebrow }: PageHeaderProps) {
  return <DashboardPageHeader title={title} description={description} action={action} eyebrow={eyebrow} />
}
