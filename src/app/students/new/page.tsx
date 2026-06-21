'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewStudentPage() {
  const supabase = createClient()
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    birthday: '',
    gender: '',
    pronouns: '',
    race_ethnicity: '',
    primary_language: '',
    school: '',
    grade_level: '',
    grad_year: '',
    personal_email: '',
    phone_number: '',
    street_address: '',
    city: '',
    zip_code: '',
    free_reduced_lunch: false,
    dietary_restrictions: '',
    shirt_size: '',
    IEP_504: '',
    iep_504_details: '',
    status: 'active',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const target = e.target
    const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value
    setForm({ ...form, [target.name]: value })
  }

  async function handleSave() {
    if (!form.first_name || !form.last_name) {
      setError('First and last name are required.')
      return
    }

    setSaving(true)
    setError(null)

    const { data, error } = await supabase
      .from('students')
      .insert({
        first_name: form.first_name,
        last_name: form.last_name,
        birthday: form.birthday || null,
        gender: form.gender || null,
        pronouns: form.pronouns || null,
        race_ethnicity: form.race_ethnicity || null,
        primary_language: form.primary_language || null,
        school: form.school || null,
        grade_level: form.grade_level || null,
        grad_year: form.grad_year ? parseInt(form.grad_year) : null,
        personal_email: form.personal_email || null,
        phone_number: form.phone_number || null,
        street_address: form.street_address || null,
        city: form.city || null,
        zip_code: form.zip_code || null,
        free_reduced_lunch: form.free_reduced_lunch,
        dietary_restrictions: form.dietary_restrictions || null,
        shirt_size: form.shirt_size || null,
        IEP_504: form.IEP_504 || null,
        iep_504_details: form.iep_504_details || null,
        status: form.status,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    // Redirect to the new student's profile
    router.push(`/students/${data.id}`)
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
    backgroundColor: '#ffffff',
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#0a2240',
    marginBottom: '6px',
  }

  const sectionStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    marginBottom: '24px',
  }

  return (
    <div>
      <Link href="/students" style={{
        color: '#6b7280', fontSize: '13px', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px',
      }}>
        ← Back to Students
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
          Add Student
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/students" style={{
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
            {saving ? 'Saving...' : 'Add Student'}
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

      {/* Personal Info */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
          Personal Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>First Name *</label>
            <input name="first_name" value={form.first_name} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Last Name *</label>
            <input name="last_name" value={form.last_name} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Birthday</label>
            <input type="date" name="birthday" value={form.birthday} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Gender</label>
            <input name="gender" value={form.gender} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Pronouns</label>
            <input name="pronouns" value={form.pronouns} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Race / Ethnicity</label>
            <input name="race_ethnicity" value={form.race_ethnicity} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Primary Language</label>
            <input name="primary_language" value={form.primary_language} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>T-Shirt Size</label>
            <input name="shirt_size" value={form.shirt_size} onChange={handleChange} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
          Contact Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Personal Email</label>
            <input name="personal_email" value={form.personal_email} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone Number</label>
            <input name="phone_number" value={form.phone_number} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Street Address</label>
            <input name="street_address" value={form.street_address} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>City</label>
            <input name="city" value={form.city} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Zip Code</label>
            <input name="zip_code" value={form.zip_code} onChange={handleChange} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Academic Info */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
          Academic Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>School</label>
            <input name="school" value={form.school} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Grade Level</label>
            <input name="grade_level" value={form.grade_level} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Graduation Year</label>
            <input name="grad_year" value={form.grad_year} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>IEP / 504</label>
            <select name="IEP_504" value={form.IEP_504} onChange={handleChange} style={inputStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="Maybe">Maybe</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>IEP / 504 Details</label>
            <textarea
              name="iep_504_details"
              value={form.iep_504_details}
              onChange={handleChange}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
          Additional Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select name="status" value={form.status} onChange={handleChange} style={inputStyle}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '24px' }}>
            <input
              type="checkbox"
              name="free_reduced_lunch"
              checked={form.free_reduced_lunch}
              onChange={handleChange}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label style={{ ...labelStyle, margin: 0 }}>Free / Reduced Lunch</label>
          </div>
          <div>
            <label style={labelStyle}>Dietary Restrictions</label>
            <input name="dietary_restrictions" value={form.dietary_restrictions} onChange={handleChange} style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '32px' }}>
        After adding the student you can link guardians from their profile page.
      </div>
    </div>
  )
}