'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function EditProgramPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const programId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  })

  useEffect(() => {
    async function load() {
      const { data: program } = await supabase
        .from('programs')
        .select('*')
        .eq('id', programId)
        .single()

      if (program) {
        setForm({
          name: program.name ?? '',
          description: program.description ?? '',
          start_date: program.start_date ?? '',
          end_date: program.end_date ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [programId])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSave() {
    if (!form.name) {
      setError('Program name is required.')
      return
    }

    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('programs')
      .update({
        name: form.name,
        description: form.description || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      })
      .eq('id', programId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    router.push(`/programs/${programId}`)
    router.refresh()
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    fontSize: '14px',
    color: '#0a2240',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#0a2240',
    marginBottom: '6px',
  }

  if (loading) {
    return <div style={{ color: '#9ca3af', fontSize: '14px', padding: '48px', textAlign: 'center' as const }}>Loading...</div>
  }

  return (
    <div>
      <Link href={`/programs/${programId}`} style={{
        color: '#6b7280', fontSize: '13px', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px',
      }}>
        ← Back to Program
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
          Edit Program
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href={`/programs/${programId}`} style={{
            backgroundColor: '#f9fafb', color: '#6b7280', padding: '10px 20px',
            borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600',
            border: '1px solid #e5e7eb',
          }}>
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              backgroundColor: saving ? '#9ca3af' : '#ff5120',
              color: '#ffffff', padding: '10px 20px', borderRadius: '8px',
              border: 'none', fontSize: '14px', fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fef2f2', color: '#dc2626', padding: '12px 16px',
          borderRadius: '8px', fontSize: '14px', marginBottom: '24px',
        }}>
          {error}
        </div>
      )}

      <div style={{
        backgroundColor: '#ffffff', borderRadius: '12px', padding: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', maxWidth: '600px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '20px' }}>
          <div>
            <label style={labelStyle}>Program Name *</label>
            <input name="name" value={form.name} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" name="start_date" value={form.start_date} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>End Date</label>
              <input type="date" name="end_date" value={form.end_date} onChange={handleChange} style={inputStyle} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}