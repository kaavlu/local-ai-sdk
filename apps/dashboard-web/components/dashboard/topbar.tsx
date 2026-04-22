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
    <header className="flex h-11 items-center justify-between gap-3 border-b border-border/60 bg-secondary px-3">
      {/* Left: Workspace name */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-tight text-foreground">Dyno Labs</span>
        <span className="rounded-md border border-border/40 bg-background/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Free
        </span>
      </div>

      {/* Center: Search placeholder */}
      <button
        type="button"
        className="group hidden w-[200px] items-center gap-1.5 rounded-md border border-border/50 bg-background/25 px-2.5 py-1.5 text-left transition-colors hover:bg-background/35 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:flex"
      >
        <Search className="h-3 w-3 text-muted-foreground/85" />
        <span className="text-xs text-muted-foreground group-hover:text-foreground/80">Search...</span>
        <kbd className="ml-auto rounded border border-border/40 bg-background/30 px-1 py-0.5 font-mono text-[10px] text-muted-foreground/65">
          /
        </kbd>
      </button>

      {/* Right: Profile dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background/30 text-[10px] font-semibold text-foreground transition-colors hover:bg-background/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-secondary">
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
