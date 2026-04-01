'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { Chrome } from 'lucide-react'

interface GoogleButtonProps {
  onError?: (error: string) => void
}

export function GoogleButton({ onError }: GoogleButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Google sign-in failed'
      onError?.(errorMessage)
      setIsLoading(false)
    }
  }

  return (
    <Button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      className="w-full h-[32px] text-[12px] font-medium bg-muted/30 hover:bg-muted/50 text-foreground border border-border/60 rounded-sm flex items-center justify-center gap-2 transition-colors"
    >
      <Chrome className="w-3.5 h-3.5" />
      {isLoading ? 'Signing in...' : 'Continue with Google'}
    </Button>
  )
}
