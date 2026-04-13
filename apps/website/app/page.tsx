import { Hero } from '@/components/sections/hero'
import { HowItWorks } from '@/components/sections/how-it-works'
import { ValueProps } from '@/components/sections/value-props'
import { CodeExample } from '@/components/sections/code-example'
import { DashboardPreview } from '@/components/sections/dashboard-preview'
import { Production } from '@/components/sections/production'
import { CTA } from '@/components/sections/cta'

export default function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <ValueProps />
      <CodeExample />
      <DashboardPreview />
      <Production />
      <CTA />
    </>
  )
}
