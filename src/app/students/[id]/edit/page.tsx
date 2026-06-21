'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type Guardian = {
  id: string
  first_name: string
  last_name: string
  phone_number: string | null
  email: string | null
  relationship: string | null
  link_id: string
}

export default function EditStudentPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [guardianSaving, setGuardianSaving] = useState<string | null>(null)

  // Add guardian panel state
  const [showAddGuardian, setShowAddGuardian] = useState(false)
  const [guardianSearch, setGuardianSearch] = useState('')
  const [guardianSearchResults, setGuardianSearchResults] = useState<Guardian[]>([])
  const [newGuardian, setNewGuardian] = useState({
    first_name: '', last_name: '', phone_number: '', email: '', relationship: ''
  })
  const [addMode, setAddMode] = useState<'search' | 'create'>('search')

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

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      setIsAdmin(profile?.role === 'admin')

      const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single()

      if (student) {
        setForm({
          first_name: student.first_name ?? '',
          last_name: student.last_name ?? '',
          birthday: student.birthday ?? '',
          gender: student.gender ?? '',
          pronouns: student.pronouns ?? '',
          race_ethnicity: student.race_ethnicity ?? '',
          primary_language: student.primary_language ?? '',
          school: student.school ?? '',
          grade_level: student.grade_level ?? '',
          grad_year: student.grad_year?.toString() ?? '',
          personal_email: student.personal_email ?? '',
          phone_number: student.phone_number ?? '',
          street_address: student.street_address ?? '',
          city: student.city ?? '',
          zip_code: student.zip_code ?? '',
          free_reduced_lunch: student.free_reduced_lunch ?? false,
          dietary_restrictions: student.dietary_restrictions ?? '',
          shirt_size: student.shirt_size ?? '',
          IEP_504: student.IEP_504 ?? '',
          iep_504_details: student.iep_504_details ?? '',
          status: student.status ?? 'active',
        })
      }

      await loadGuardians()
      setLoading(false)
    }
    load()
  }, [studentId])

  async function loadGuardians() {
    const { data } = await supabase
      .from('student_guardians')
      .select(`
        id,
        guardians (
          id,
          first_name,
          last_name,
          phone_number,
          email,
          relationship
        )
      `)
      .eq('student_id', studentId)

    const mapped = (data ?? []).map((item: any) => ({
      ...item.guardians,
      link_id: item.id,
    }))
    setGuardians(mapped)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const target = e.target
    const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value
    setForm({ ...form, [target.name]: value })
  }

  function handleGuardianChange(index: number, field: string, value: string) {
    const updated = [...guardians]
    updated[index] = { ...updated[index], [field]: value }
    setGuardians(updated)
  }

  async function handleSaveStudent() {
    if (!form.first_name || !form.last_name) {
      setError('First and last name are required.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)

    const { error } = await supabase
      .from('students')
      .update({
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
      .eq('id', studentId)

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Student info saved successfully.')
    }
    setSaving(false)
  }

  async function handleSaveGuardian(guardian: Guardian) {
    setGuardianSaving(guardian.id)
    const { error } = await supabase
      .from('guardians')
      .update({
        first_name: guardian.first_name,
        last_name: guardian.last_name,
        phone_number: guardian.phone_number || null,
        email: guardian.email || null,
        relationship: guardian.relationship || null,
      })
      .eq('id', guardian.id)

    if (error) setError(error.message)
    else setSuccess('Guardian saved successfully.')
    setGuardianSaving(null)
  }

  async function handleRemoveGuardian(guardian: Guardian) {
    if (!confirm(`Remove ${guardian.first_name} ${guardian.last_name} from this student?`)) return

    // Delete the link
    await supabase
      .from('student_guardians')
      .delete()
      .eq('id', guardian.link_id)

    // Check if guardian has other links
    const { data: otherLinks } = await supabase
      .from('student_guardians')
      .select('id')
      .eq('guardian_id', guardian.id)

    // If no other links, delete the guardian entirely
    if (!otherLinks || otherLinks.length === 0) {
      await supabase
        .from('guardians')
        .delete()
        .eq('id', guardian.id)
    }

    await loadGuardians()
    setSuccess('Guardian removed.')
  }

  async function handleSearchGuardians(query: string) {
    setGuardianSearch(query)
    if (!query || query.length < 2) {
      setGuardianSearchResults([])
      return
    }

    const { data } = await supabase
      .from('guardians')
      .select('*')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10)

    // Filter out already linked guardians
    const linkedIds = guardians.map(g => g.id)
    setGuardianSearchResults((data ?? []).filter((g: any) => !linkedIds.includes(g.id)))
  }

  async function handleLinkExistingGuardian(guardian: any) {
    const { error } = await supabase
      .from('student_guardians')
      .insert({ student_id: studentId, guardian_id: guardian.id })

    if (error) {
      setError(error.message)
      return
    }

    await loadGuardians()
    setShowAddGuardian(false)
    setGuardianSearch('')
    setGuardianSearchResults([])
    setSuccess('Guardian linked successfully.')
  }

  async function handleCreateAndLinkGuardian() {
    if (!newGuardian.first_name || !newGuardian.last_name) {
      setError('Guardian first and last name are required.')
      return
    }

    // Create new guardian
    const { data: created, error: createError } = await supabase
      .from('guardians')
      .insert({
        first_name: newGuardian.first_name,
        last_name: newGuardian.last_name,
        phone_number: newGuardian.phone_number || null,
        email: newGuardian.email || null,
        relationship: newGuardian.relationship || null,
      })
      .select()
      .single()

    if (createError || !created) {
      setError(createError?.message ?? 'Failed to create guardian.')
      return
    }

    // Link to student
    const { error: linkError } = await supabase
      .from('student_guardians')
      .insert({ student_id: studentId, guardian_id: created.id })

    if (linkError) {
      setError(linkError.message)
      return
    }

    await loadGuardians()
    setShowAddGuardian(false)
    setNewGuardian({ first_name: '', last_name: '', phone_number: '', email: '', relationship: '' })
    setSuccess('Guardian created and linked successfully.')
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

  if (loading) {
    return <div style={{ color: '#9ca3af', fontSize: '14px', padding: '48px', textAlign: 'center' as const }}>Loading...</div>
  }

  return (
    <div>
      <Link href={`/students/${studentId}`} style={{
        color: '#6b7280', fontSize: '13px', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px',
      }}>
        ← Back to Profile
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
          Edit Student
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href={`/students/${studentId}`} style={{
            backgroundColor: '#f9fafb', color: '#6b7280', padding: '10px 20px',
            borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600',
            border: '1px solid #e5e7eb',
          }}>
            Cancel
          </Link>
          <button onClick={handleSaveStudent} disabled={saving} style={{
            backgroundColor: saving ? '#9ca3af' : '#ff5120',
            color: '#ffffff', padding: '10px 20px', borderRadius: '8px',
            border: 'none', fontSize: '14px', fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
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

      {success && (
        <div style={{
          backgroundColor: '#f0fdf4', color: '#16a34a', padding: '12px 16px',
          borderRadius: '8px', fontSize: '14px', marginBottom: '24px',
        }}>
          {success}
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

      {/* Guardians */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
            Guardians
          </h2>
          {isAdmin && (
            <button
              onClick={() => { setShowAddGuardian(!showAddGuardian); setError(null) }}
              style={{
                backgroundColor: '#ff5120', color: '#ffffff', padding: '8px 16px',
                borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              + Add Guardian
            </button>
          )}
        </div>

        {/* Add Guardian Panel */}
        {showAddGuardian && isAdmin && (
          <div style={{
            backgroundColor: '#f9fafb', borderRadius: '8px', padding: '20px',
            border: '1px solid #e5e7eb', marginBottom: '20px',
          }}>
            {/* Toggle search vs create */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['search', 'create'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAddMode(mode as 'search' | 'create')}
                  style={{
                    padding: '6px 16px', borderRadius: '6px', border: 'none',
                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    backgroundColor: addMode === mode ? '#0a2240' : '#e5e7eb',
                    color: addMode === mode ? '#ffffff' : '#6b7280',
                  }}
                >
                  {mode === 'search' ? 'Search Existing' : 'Create New'}
                </button>
              ))}
            </div>

            {/* Search existing */}
            {addMode === 'search' && (
              <div>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={guardianSearch}
                  onChange={(e) => handleSearchGuardians(e.target.value)}
                  style={inputStyle}
                />
                {guardianSearchResults.length > 0 && (
                  <div style={{
                    border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '8px', overflow: 'hidden',
                  }}>
                    {guardianSearchResults.map((g: any) => (
                      <div
                        key={g.id}
                        onClick={() => handleLinkExistingGuardian(g)}
                        style={{
                          padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                          backgroundColor: '#ffffff',
                        }}
                      >
                        <div style={{ fontWeight: '600', color: '#0a2240', fontSize: '14px' }}>
                          {g.first_name} {g.last_name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {g.email} {g.relationship ? `· ${g.relationship}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {guardianSearch.length >= 2 && guardianSearchResults.length === 0 && (
                  <div style={{ color: '#9ca3af', fontSize: '13px', marginTop: '8px' }}>
                    No existing guardians found. Try creating a new one.
                  </div>
                )}
              </div>
            )}

            {/* Create new */}
            {addMode === 'create' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>First Name *</label>
                  <input
                    value={newGuardian.first_name}
                    onChange={(e) => setNewGuardian({ ...newGuardian, first_name: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Last Name *</label>
                  <input
                    value={newGuardian.last_name}
                    onChange={(e) => setNewGuardian({ ...newGuardian, last_name: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input
                    value={newGuardian.phone_number}
                    onChange={(e) => setNewGuardian({ ...newGuardian, phone_number: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    value={newGuardian.email}
                    onChange={(e) => setNewGuardian({ ...newGuardian, email: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Relationship</label>
                  <input
                    value={newGuardian.relationship}
                    onChange={(e) => setNewGuardian({ ...newGuardian, relationship: e.target.value })}
                    placeholder="e.g. Mother, Father, Guardian"
                    style={inputStyle}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleCreateAndLinkGuardian}
                    style={{
                      backgroundColor: '#ff5120', color: '#ffffff', padding: '10px 20px',
                      borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Create & Link Guardian
                  </button>
                  <button
                    onClick={() => setShowAddGuardian(false)}
                    style={{
                      backgroundColor: '#f9fafb', color: '#6b7280', padding: '10px 20px',
                      borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px',
                      fontWeight: '600', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Guardian cards */}
        {guardians.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '14px' }}>No guardians linked to this student.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
            {guardians.map((guardian, index) => (
              <div key={guardian.id} style={{
                backgroundColor: '#f9fafb', borderRadius: '8px', padding: '20px',
                border: '1px solid #e5e7eb',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontWeight: '700', color: '#0a2240', fontSize: '14px' }}>
                    {guardian.first_name} {guardian.last_name}
                    <span style={{ fontSize: '12px', color: '#5eb3e4', fontWeight: '600', marginLeft: '8px' }}>
                      {guardian.relationship ?? 'Guardian'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleSaveGuardian(guardian)}
                      disabled={guardianSaving === guardian.id}
                      style={{
                        backgroundColor: guardianSaving === guardian.id ? '#9ca3af' : '#0a2240',
                        color: '#ffffff', padding: '6px 14px', borderRadius: '6px',
                        border: 'none', fontSize: '12px', fontWeight: '600',
                        cursor: guardianSaving === guardian.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {guardianSaving === guardian.id ? 'Saving...' : 'Save'}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveGuardian(guardian)}
                        style={{
                          backgroundColor: '#fef2f2', color: '#dc2626', padding: '6px 14px',
                          borderRadius: '6px', border: '1px solid #fecaca', fontSize: '12px',
                          fontWeight: '600', cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>First Name</label>
                    <input
                      value={guardian.first_name}
                      onChange={(e) => handleGuardianChange(index, 'first_name', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Last Name</label>
                    <input
                      value={guardian.last_name}
                      onChange={(e) => handleGuardianChange(index, 'last_name', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone Number</label>
                    <input
                      value={guardian.phone_number ?? ''}
                      onChange={(e) => handleGuardianChange(index, 'phone_number', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input
                      value={guardian.email ?? ''}
                      onChange={(e) => handleGuardianChange(index, 'email', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Relationship</label>
                    <input
                      value={guardian.relationship ?? ''}
                      onChange={(e) => handleGuardianChange(index, 'relationship', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}