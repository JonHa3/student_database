'use client'

import Sidebar from '@/components/sidebar'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
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
  )
}