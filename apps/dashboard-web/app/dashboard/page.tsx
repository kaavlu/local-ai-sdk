import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { BarChart3 } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <PageHeader 
        title="Overview" 
        description="Welcome back. Here&apos;s an overview of your workspace."
      />
      <EmptyState
        icon={BarChart3}
        title="No data yet"
        description="Create your first project to start tracking analytics and performance"
      />
    </DashboardLayout>
  )
}
