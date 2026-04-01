import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')

  // Handle auth errors
  if (error) {
    const errorMessage = error_description || error
    return NextResponse.redirect(
      new URL(
        `/signin?error=${encodeURIComponent(errorMessage)}`,
        request.url
      )
    )
  }

  // Exchange the code for a session
  if (code) {
    try {
      const supabase = await createClient()
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        throw exchangeError
      }

      // Successfully authenticated
      return NextResponse.redirect(new URL('/dashboard', request.url))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed'
      return NextResponse.redirect(
        new URL(
          `/signin?error=${encodeURIComponent(errorMessage)}`,
          request.url
        )
      )
    }
  }

  // Invalid request
  return NextResponse.redirect(
    new URL('/signin?error=Invalid%20authentication%20request', request.url)
  )
}
