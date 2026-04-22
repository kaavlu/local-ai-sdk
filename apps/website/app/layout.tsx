import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Dyno — Local-first AI on the same user device',
  description:
    'Dyno is an SDK + local runtime that runs AI on the same user device when viable, then falls back to the app\'s existing cloud provider path when needed. The control plane provides policy and telemetry.',
  openGraph: {
    title: 'Dyno — Local-first AI for apps',
    description:
      'On-device execution when viable, predictable app-owned cloud fallback when not.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#050507',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
