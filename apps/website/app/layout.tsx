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
  title: 'Dyno — Local-first AI inference with automatic cloud fallback',
  description:
    'Dyno is an SDK that routes AI requests to on-device models when possible and falls back to cloud providers when not. Cut inference costs without sacrificing reliability.',
  openGraph: {
    title: 'Dyno — Local-first AI inference',
    description:
      'Run AI locally. Fall back to the cloud. One SDK, any provider, automatic routing.',
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
