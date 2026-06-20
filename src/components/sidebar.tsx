'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'Programs', href: '/programs' },
  { label: 'Students', href: '/students' },
  { label: 'Import', href: '/import' }
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: '240px',
      minHeight: '100vh',
      backgroundColor: '#0a2240',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      position: 'fixed',
      left: 0,
      top: 0,
    }}>
      {/* Logo area */}
      <div style={{
        padding: '28px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div style={{
          color: '#ffffff',
          fontSize: '20px',
          fontWeight: '800',
          letterSpacing: '-0.5px',
          lineHeight: 1.2
        }}>
          do<span style={{ color: '#ff5120' }}>{'>'}</span>
        </div>
        <div style={{
          color: '#5eb3e4',
          fontSize: '11px',
          fontWeight: '600',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          marginTop: '4px'
        }}>
          Charlotte
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '16px 0', flex: 1 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 24px',
                color: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: isActive ? '600' : '400',
                borderLeft: isActive ? '3px solid #ff5120' : '3px solid transparent',
                backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                transition: 'all 0.15s ease',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom user area */}
      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.45)',
        fontSize: '12px',
      }}>
        Do Greater Charlotte
      </div>
    </aside>
  )
}