import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/sidebar'

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
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main style={{
            marginLeft: '240px',
            flex: 1,
            minHeight: '100vh',
            padding: '32px',
          }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}