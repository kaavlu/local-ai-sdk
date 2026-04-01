import { AuthCard } from '@/components/auth/auth-card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function SignUpSuccessPage() {
  return (
    <AuthCard
      title="Check your email"
      subtitle="We sent you a confirmation link to complete your registration."
    >
      <div className="text-center space-y-4">
        <p className="text-[13px] text-muted-foreground">
          Please check your inbox and click the confirmation link to activate your account.
        </p>
        <Button asChild variant="outline" className="h-[34px] text-[13px]">
          <Link href="/signin">
            Back to sign in
          </Link>
        </Button>
      </div>
    </AuthCard>
  )
}
