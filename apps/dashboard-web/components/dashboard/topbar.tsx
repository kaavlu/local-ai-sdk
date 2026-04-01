'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, LogOut, User } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TopbarProps {
  userEmail?: string | null
}

export function Topbar({ userEmail }: TopbarProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/signin')
    router.refresh()
  }

  // Get initials from email
  const initials = userEmail
    ? userEmail.charAt(0).toUpperCase()
    : 'U'

  return (
    <header className="h-11 bg-secondary border-b border-border/50 flex items-center justify-between px-3 gap-4">
      {/* Left: Workspace name */}
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold text-foreground tracking-tight">Dyno Labs</span>
        <span className="text-[9px] px-1 py-0.5 rounded-sm bg-muted/40 text-muted-foreground font-medium border border-border/30">
          Free
        </span>
      </div>

      {/* Center: Search placeholder */}
      <div className="hidden md:flex items-center gap-1.5 bg-muted/20 border border-border/40 rounded-sm px-2.5 py-1.5 w-[200px] group hover:bg-muted/30 transition-colors">
        <Search className="w-3 h-3 text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground group-hover:text-muted-foreground/80">Search...</span>
        <kbd className="ml-auto text-[9px] text-muted-foreground/50 bg-muted/30 px-1 py-0.5 rounded border border-border/30 font-mono">
          /
        </kbd>
      </div>

      {/* Right: Profile dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-6 h-6 rounded-sm bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary hover:bg-primary/25 transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1 focus:ring-offset-secondary">
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem className="text-[12px] cursor-pointer">
            <User className="w-3.5 h-3.5 mr-2" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-[12px] cursor-pointer text-destructive/80 hover:text-destructive focus:text-destructive"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
