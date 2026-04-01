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
    <aside className="fixed left-0 top-0 h-screen w-[196px] bg-secondary border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-11 flex items-center px-3 border-b border-border/50">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image
            src="/dyno-logo.png"
            alt="dyno logo"
            width={24}
            height={24}
            className="w-5 h-5"
            priority
          />
          <span className="text-[13px] font-semibold text-foreground tracking-tight">dyno</span>
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
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-[12px] font-medium transition-colors duration-200',
                    isActive
                      ? 'bg-muted/60 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  )}
                >
                  <item.icon
                    className={cn(
                      'w-3.5 h-3.5 flex-shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
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
