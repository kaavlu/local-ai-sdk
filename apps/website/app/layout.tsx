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
  title: 'Dyno — SDK-first local AI with developer-owned cloud fallback',
  description:
    'Dyno is SDK-first: run AI on the user’s device when it makes sense, and use your existing cloud provider when it does not. The hosted control plane delivers project config and telemetry—not the default inference router.',
  openGraph: {
    title: 'Dyno — SDK-first local AI',
    description:
      'Local-first execution with your existing provider as fallback. Config and telemetry in the control plane.',
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
