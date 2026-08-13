/**
 * Root layout — wraps every page in the fixed sidebar (ClientLayout ->
 * Sidebar) and sets the base font/background. Auth gating itself happens in
 * middleware.ts, not here.
 */
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ClientLayout from '@/components/clientlayout'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Do Greater Charlotte — Student Dashboard',
  description: 'Internal student management dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ margin: 0, backgroundColor: '#f7f8fa' }}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}