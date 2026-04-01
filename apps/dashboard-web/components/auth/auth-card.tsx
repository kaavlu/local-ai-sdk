import Image from 'next/image'
import Link from 'next/link'

interface AuthCardProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export function AuthCard({ children, title, subtitle }: AuthCardProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center dot-pattern">
      {/* Purple glow background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#7C6CFF]/10 rounded-full blur-[120px]" />
      </div>
      
      <div className="relative w-full max-w-[360px] mx-auto px-4 animate-fade-in-up">
        <div className="auth-glow bg-card rounded-lg p-6 border border-border/20">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-5">
            <Image
              src="/dyno-logo.png"
              alt="dyno logo"
              width={32}
              height={32}
              className="w-7 h-7"
              priority
            />
            <span className="text-[15px] font-semibold text-foreground tracking-tight">dyno</span>
          </div>
          
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-[14px] font-semibold text-foreground mb-1 tracking-tight">{title}</h1>
            <p className="text-[12px] text-muted-foreground/80">{subtitle}</p>
          </div>
          
          {children}
        </div>
        
        {/* Footer */}
        <div className="mt-5 text-center">
          <p className="text-[10px] text-muted-foreground/50 mb-2 leading-relaxed">
            By continuing, you agree to dyno&apos;s Terms of Service and Privacy Policy.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="#" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors">
              Docs
            </Link>
            <span className="text-muted-foreground/30">•</span>
            <Link href="#" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors">
              Blog
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
