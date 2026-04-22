import type { NextRequest } from 'next/server'

import { updateSession } from './lib/supabase/middleware'

/**
 * Next.js 16+ edge entry for request interception (replaces deprecated middleware.ts).
 * Uses a relative import so the Edge bundle does not resolve `@/…` aliases
 * (Vercel previously rejected that graph as unsupported for middleware).
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
