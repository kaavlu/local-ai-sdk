'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthCard } from '@/components/auth/auth-card'
import { GoogleButton } from '@/components/auth/google-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function SignInPageContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check for error from callback
    const errorParam = searchParams.get('error')
    if (errorParam) {
      setError(decodeURIComponent(errorParam))
    }
  }, [searchParams])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthCard
      title="Sign in to your account"
      subtitle="Welcome back. Pick up where you left off."
    >
      <GoogleButton onError={setError} />

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border/30"></div>
        </div>
        <div className="relative flex justify-center text-[10px]">
          <span className="px-2 bg-card text-muted-foreground/50">or</span>
        </div>
      </div>

      <form onSubmit={handleSignIn} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[11px] font-medium text-muted-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-[32px] text-[12px] bg-muted/40 border-border/60 focus:border-ring focus:ring-ring/20 placeholder:text-muted-foreground/50"
          />
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[11px] font-medium text-muted-foreground">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-[32px] text-[12px] bg-muted/40 border-border/60 focus:border-ring focus:ring-ring/20 placeholder:text-muted-foreground/50"
          />
        </div>

        {error && (
          <p className="text-[11px] text-destructive/80 bg-destructive/5 px-2.5 py-1.5 rounded-sm border border-destructive/10">{error}</p>
        )}

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-[32px] text-[12px] font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-sm"
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <span className="text-[12px] text-muted-foreground/60">Don&apos;t have an account? </span>
        <Link
          href="/signup"
          className="text-[12px] text-primary hover:text-primary/90 font-medium transition-colors"
        >
          Sign up
        </Link>
      </div>
    </AuthCard>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageContent />
    </Suspense>
  )
}
