'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FolderKanban, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    label: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Projects',
    href: '/projects',
    icon: FolderKanban,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-[196px] flex-col border-r border-border/60 bg-secondary">
      {/* Logo */}
      <div className="flex h-11 items-center border-b border-border/60 px-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image
            src="/dyno-logo.png"
            alt="dyno logo"
            width={24}
            height={24}
            className="w-5 h-5"
            priority
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">dyno</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
                    isActive
                      ? 'bg-background/45 text-foreground'
                      : 'text-muted-foreground hover:bg-background/30 hover:text-foreground'
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-3.5 w-3.5 flex-shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground/90 group-hover:text-foreground'
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
