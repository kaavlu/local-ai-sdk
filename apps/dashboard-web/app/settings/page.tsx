import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Plus, Trash2 } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <PageHeader title="Settings" description="Manage workspace, profile, and security settings." />
      
      <div className="max-w-3xl space-y-6 animate-fade-in-up">
        {/* Workspace Section */}
        <div className="bg-card border border-border/40 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-[13px] font-semibold text-foreground">Workspace</h2>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">Configure workspace settings and details</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="workspace" className="text-[11px] font-medium text-muted-foreground">
                Workspace Name
              </Label>
              <Input
                id="workspace"
                type="text"
                defaultValue="Dyno Labs"
                className="h-[32px] text-[12px] bg-muted/30 border-border/40 focus:border-ring/60 focus:ring-ring/15"
              />
            </div>
            
            <div className="flex justify-end">
              <Button
                disabled
                className="h-[32px] text-[11px] font-medium bg-primary/30 text-primary/50 cursor-not-allowed rounded-sm"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>

        {/* Profile Section */}
        <div className="bg-card border border-border/40 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-[13px] font-semibold text-foreground">Profile</h2>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">Manage your personal account information</p>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary flex-shrink-0">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">Email Address</p>
                <p className="text-[12px] text-foreground font-medium truncate">{user.email}</p>
              </div>
            </div>
            
            <div className="pt-2 border-t border-border/30">
              <p className="text-[11px] font-medium text-muted-foreground mb-2">Account Created</p>
              <p className="text-[12px] text-foreground">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* API Keys Section */}
        <div className="bg-card border border-border/40 rounded-lg p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-foreground">API Keys</h2>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">Manage API keys for programmatic access</p>
            </div>
            <Button
              disabled
              className="h-[32px] text-[11px] font-medium bg-primary/30 text-primary/50 cursor-not-allowed rounded-sm gap-1.5"
            >
              <Plus className="w-3 h-3" />
              Create Key
            </Button>
          </div>
          
          <div className="bg-muted/20 border border-border/30 rounded-sm p-4">
            <p className="text-[12px] text-muted-foreground/60 text-center py-3">
              No API keys yet. Create one to get started.
            </p>
          </div>
        </div>

        {/* Danger Zone Section */}
        <div className="bg-card border border-destructive/10 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-[13px] font-semibold text-destructive">Danger Zone</h2>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">Irreversible actions</p>
          </div>
          
          <div className="space-y-3 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-foreground">Delete Workspace</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Permanently delete this workspace and all data</p>
              </div>
              <Button
                disabled
                className="h-[32px] text-[11px] font-medium bg-destructive/20 text-destructive/50 border border-destructive/20 hover:bg-destructive/25 cursor-not-allowed rounded-sm gap-1.5"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
