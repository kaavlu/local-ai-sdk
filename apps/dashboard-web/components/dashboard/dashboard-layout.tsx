import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

interface DashboardLayoutProps {
  children: React.ReactNode
  userEmail?: string | null
}

export function DashboardLayout({ children, userEmail }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background dot-pattern">
      <Sidebar />
      <div className="ml-[196px] flex flex-col min-h-screen">
        <Topbar userEmail={userEmail} />
        <main className="flex-1 p-5">
          <div className="max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
