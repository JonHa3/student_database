'use client'

/** Admin-only form (access enforced by the Programs list page and RLS) for creating a program. */
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewProgramPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit() {
    if (!form.name) {
      setError('Program name is required.')
      return
    }

    setLoading(true)
    setError(null)

    const { error } = await supabase
      .from('programs')
      .insert({
        name: form.name,
        description: form.description || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/programs')
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

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '32px' }}>
        <Link href="/programs" style={{
          color: '#6b7280',
          fontSize: '13px',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          marginBottom: '12px',
        }}>
          ← Back to Programs
        </Link>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#0a2240',
          margin: 0,
        }}>
          Add Program
        </h1>
      </div>

      {/* Form */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        maxWidth: '600px',
      }}>
        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            marginBottom: '24px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={labelStyle}>Program Name *</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Coding Bootcamp"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Brief description of the program..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date</label>
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '32px',
        }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              backgroundColor: loading ? '#9ca3af' : '#ff5120',
              color: '#ffffff',
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving...' : 'Save Program'}
          </button>
          <Link href="/programs" style={{
            backgroundColor: '#f9fafb',
            color: '#6b7280',
            padding: '10px 24px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '600',
          }}>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}