'use client'

/**
 * Interactive half of the Team page: role changes and member removal.
 * There's no invite flow — a new team member gets access simply by signing
 * in with Google (see the login page), at which point they show up here
 * with no role yet and can be promoted to staff/admin.
 */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

type Member = {
  id: string
  role: string
  created_at: string
  email: string
  name: string | null
  avatar: string | null
}

export default function TeamClient({
  members: initialMembers,
  currentUserId,
}: {
  members: Member[]
  currentUserId: string
}) {
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [saving, setSaving] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  async function handleRoleChange(memberId: string, newRole: string) {
    setSaving(memberId)
    setError(null)
    setSuccess(null)

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', memberId)

    if (error) {
      setError(error.message)
    } else {
      setMembers(members.map(m => m.id === memberId ? { ...m, role: newRole } : m))
      setSuccess('Role updated successfully.')
    }
    setSaving(null)
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Remove this team member? They will lose access to the dashboard.')) return

    setSaving(memberId)
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', memberId)

    if (error) {
      setError(error.message)
    } else {
      setMembers(members.filter(m => m.id !== memberId))
      setSuccess('Team member removed.')
    }
    setSaving(null)
  }

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
          Team
        </h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>
          {members.length} team {members.length === 1 ? 'member' : 'members'} with dashboard access
        </p>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fef2f2', color: '#dc2626', padding: '12px 16px',
          borderRadius: '8px', fontSize: '14px', marginBottom: '24px',
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          backgroundColor: '#f0fdf4', color: '#16a34a', padding: '12px 16px',
          borderRadius: '8px', fontSize: '14px', marginBottom: '24px',
        }}>
          {success}
        </div>
      )}

      {/* How to invite section */}
      <div style={{
        backgroundColor: '#f0f9ff',
        borderRadius: '12px',
        padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: '24px',
        border: '1px solid #bae6fd',
      }}>
        <div style={{ fontWeight: '700', color: '#0a2240', fontSize: '14px', marginBottom: '8px' }}>
          How to invite team members
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
          Share the dashboard URL with your team member and have them sign in with their Google account.
          Once they sign in they will appear here and you can assign them a role.
          Until a role is assigned they will not be able to access any data.
        </div>
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          fontSize: '13px',
          color: '#0a2240',
          fontFamily: 'monospace',
        }}>
          {origin || '...'}
        </div>
      </div>

      {/* Team members table */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Member', 'Role', 'Joined', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '12px 16px',
                  textAlign: 'left' as const,
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.5px',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member, i) => (
              <tr key={member.id} style={{
                borderBottom: i < members.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                {/* Member info */}
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {member.avatar ? (
                      <img
                        src={member.avatar}
                        alt=""
                        style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                      />
                    ) : (
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        backgroundColor: '#0a2240', color: '#ffffff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: '700',
                      }}>
                        {member.email[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: '600', color: '#0a2240', fontSize: '14px' }}>
                        {member.name ?? member.email.split('@')[0]}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        {member.email}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td style={{ padding: '14px 16px' }}>
                  {member.id === currentUserId ? (
                    <span style={{
                      backgroundColor: member.role === 'admin' ? '#fff3eb' : '#f0f9ff',
                      color: member.role === 'admin' ? '#ff5120' : '#5eb3e4',
                      fontSize: '12px',
                      fontWeight: '600',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.5px',
                    }}>
                      {member.role}
                    </span>
                  ) : (
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      disabled={saving === member.id}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb',
                        fontSize: '13px',
                        color: '#0a2240',
                        backgroundColor: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                    </select>
                  )}
                </td>

                {/* Joined date */}
                <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                  {new Date(member.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </td>

                {/* Actions */}
                <td style={{ padding: '14px 16px' }}>
                  {member.id === currentUserId ? (
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>You</span>
                  ) : (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={saving === member.id}
                      style={{
                        backgroundColor: '#fef2f2',
                        color: '#dc2626',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #fecaca',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: saving === member.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving === member.id ? 'Removing...' : 'Remove'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}