import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { FolderKanban } from 'lucide-react'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <PageHeader 
        title="Projects" 
        description="Create and manage your AI projects and use cases."
      />
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Create a new project to get started building with AI"
      />
    </DashboardLayout>
  )
}
