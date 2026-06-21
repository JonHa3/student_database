'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Papa from 'papaparse'
import Link from 'next/link'

type RawRow = Record<string, string>

type ParsedStudent = {
  first_name: string
  last_name: string
  birthday: string | null
  gender: string | null
  pronouns: string | null
  race_ethnicity: string | null
  primary_language: string | null
  school: string | null
  grade_level: string | null
  grad_year: number | null
  personal_email: string | null
  phone_number: string | null
  street_address: string | null
  city: string | null
  zip_code: string | null
  free_reduced_lunch: boolean | null
  dietary_restrictions: string | null
  shirt_size: string | null
  IEP_504: string | null
  iep_504_details: string | null
  status: string
  created_at: string | null
}

type ParsedGuardian = {
  first_name: string
  last_name: string
  phone_number: string | null
  email: string | null
  relationship: string | null
  created_at: string | null
}

function parseBoolean(val: string | undefined): boolean | null {
  if (!val) return null
  const v = val.toLowerCase().trim()
  if (v === 'true' || v === 'yes') return true
  if (v === 'false' || v === 'no') return false
  return null
}

function parseDate(val: string | undefined): string | null {
  if (!val) return null
  const cleaned = val.trim()
  const parts = cleaned.split('/')
  if (parts.length === 3) {
    const [month, day, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return cleaned
}

function parseRows(rows: RawRow[]): { students: ParsedStudent[], guardians: ParsedGuardian[] } {
  const students: ParsedStudent[] = rows.map(row => ({
    first_name: row['first_name']?.trim() ?? '',
    last_name: row['last_name']?.trim() ?? '',
    birthday: parseDate(row['birthday']),
    gender: row['gender']?.trim() || null,
    pronouns: row['pronouns']?.trim() || null,
    race_ethnicity: row['race_ethnicity']?.trim() || null,
    primary_language: row['primary_language']?.trim() || null,
    school: row['school']?.trim() || null,
    grade_level: row['grade_level']?.trim() || null,
    grad_year: row['grad_year'] ? parseInt(row['grad_year']) : null,
    personal_email: row['personal_email']?.trim() || null,
    phone_number: row['phone_number']?.trim() || null,
    street_address: row['street_address']?.trim() || null,
    city: row['city']?.trim() || null,
    zip_code: row['zip_code']?.trim() || null,
    free_reduced_lunch: parseBoolean(row['free_reduced_lunch']),
    dietary_restrictions: row['dietary_restrictions']?.trim() || null,
    shirt_size: row['shirt_size']?.trim() || null,
    IEP_504: row['iep_or_504']?.trim() || null,
    iep_504_details: row['iep_504_details']?.trim() || null,
    status: 'active',
    created_at: row['created_at']?.trim() || null,
  }))

  const guardians: ParsedGuardian[] = []

  rows.forEach(row => {
    // Primary guardian
    if (row['guardian_first_name']?.trim()) {
      guardians.push({
        first_name: row['guardian_first_name'].trim(),
        last_name: row['guardian_last_name']?.trim() ?? '',
        phone_number: row['guardian_phone_number']?.trim() || null,
        email: row['guardian_email']?.trim() || null,
        relationship: row['guardian_relationship']?.trim() || null,
        created_at: row['created_at']?.trim() || null,
      })
    }

    // Secondary contact
    if (row['secondary_first_name']?.trim()) {
      guardians.push({
        first_name: row['secondary_first_name'].trim(),
        last_name: row['secondary_last_name']?.trim() ?? '',
        phone_number: row['secondary_phone_number']?.trim() || null,
        email: row['secondary_email']?.trim() || null,
        relationship: row['secondary_relationship']?.trim() || null,
        created_at: row['created_at']?.trim() || null,
      })
    }
  })

  return { students, guardians }
}

export default function ImportPage() {
  const supabase = createClient()
  const [parsed, setParsed] = useState<{ students: ParsedStudent[], guardians: ParsedGuardian[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean, message: string } | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawRows = results.data as RawRow[]
        setParsed(parseRows(rawRows))
        setStep('preview')
      }
    })
  }

  async function handleImport() {
    if (!parsed) return
    setLoading(true)
    setResult(null)

    try {
      // Insert students
      const { error: studentError } = await supabase
        .from('students')
        .insert(parsed.students)

      if (studentError) throw new Error(`Student import failed: ${studentError.message}`)

      // Insert guardians
      const validGuardians = parsed.guardians.filter(g => g.first_name)
      if (validGuardians.length > 0) {
        const { error: guardianError } = await supabase
          .from('guardians')
          .insert(validGuardians)

        if (guardianError) throw new Error(`Guardian import failed: ${guardianError.message}`)

        // Link guardians to students
        const { error: linkError } = await supabase.rpc('link_guardians_to_students')
        if (linkError) console.warn('Linking warning:', linkError.message)
      }

      setResult({
        success: true,
        message: `Successfully imported ${parsed.students.length} students and ${validGuardians.length} guardians.`
      })
      setStep('done')
    } catch (err) {
      setResult({ success: false, message: (err as Error).message })
    }

    setLoading(false)
  }

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
          Import Students
        </h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>
          Upload your renamed CSV export to import students and guardians.
        </p>
      </div>

      {/* Steps indicator */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', alignItems: 'center' }}>
        {['Upload', 'Preview', 'Done'].map((s, i) => {
          const stepIndex = ['upload', 'preview', 'done'].indexOf(step)
          const isActive = i === stepIndex
          const isComplete = i < stepIndex
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                backgroundColor: isComplete ? '#ff5120' : isActive ? '#0a2240' : '#e5e7eb',
                color: isComplete || isActive ? '#ffffff' : '#9ca3af',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: '700',
              }}>
                {isComplete ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: '13px',
                fontWeight: isActive ? '600' : '400',
                color: isActive ? '#0a2240' : '#9ca3af',
              }}>
                {s}
              </span>
              {i < 2 && <div style={{ width: '32px', height: '1px', backgroundColor: '#e5e7eb' }} />}
            </div>
          )
        })}
      </div>

      {/* Upload step */}
      {step === 'upload' && (
        <div style={{
          backgroundColor: '#ffffff', borderRadius: '12px', padding: '48px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
          <div style={{ fontWeight: '700', color: '#0a2240', fontSize: '18px', marginBottom: '8px' }}>
            Upload your CSV file
          </div>
          <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
            Make sure column headers have been renamed before uploading.
          </div>
          <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '32px' }}>
            Refer to the Import Guide for the full list of expected column names.
          </div>
          <label style={{
            backgroundColor: '#ff5120', color: '#ffffff', padding: '12px 32px',
            borderRadius: '8px', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer', display: 'inline-block',
          }}>
            Choose CSV File
            <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* Preview step */}
      {step === 'preview' && parsed && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Students to import', value: parsed.students.length, color: '#ff5120' },
              { label: 'Guardians to import', value: parsed.guardians.filter(g => g.first_name).length, color: '#5eb3e4' },
            ].map(stat => (
              <div key={stat.label} style={{
                backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderTop: `3px solid ${stat.color}`,
              }}>
                <div style={{ fontSize: '32px', fontWeight: '800', color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Student preview */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '24px',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
                Student Preview
              </h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Name', 'Birthday', 'School', 'Grade', 'Email', 'IEP/504', 'IEP Details'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left', fontSize: '11px',
                        fontWeight: '600', color: '#6b7280', textTransform: 'uppercase',
                        letterSpacing: '0.5px', whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.students.map((s, i) => (
                    <tr key={i} style={{ borderBottom: i < parsed.students.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#0a2240' }}>
                        {s.first_name} {s.last_name}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{s.birthday ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{s.school ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{s.grade_level ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{s.personal_email ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{s.IEP_504 ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{s.iep_504_details ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Guardian preview */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '24px',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
                Guardian Preview
              </h2>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Name', 'Relationship', 'Phone', 'Email'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: '11px',
                      fontWeight: '600', color: '#6b7280', textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.guardians.filter(g => g.first_name).map((g, i) => (
                  <tr key={i} style={{ borderBottom: i < parsed.guardians.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#0a2240' }}>
                      {g.first_name} {g.last_name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{g.relationship ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{g.phone_number ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{g.email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleImport}
              disabled={loading}
              style={{
                backgroundColor: loading ? '#9ca3af' : '#ff5120',
                color: '#ffffff', padding: '12px 32px', borderRadius: '8px',
                border: 'none', fontSize: '14px', fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Importing...' : `Import ${parsed.students.length} Students`}
            </button>
            <button
              onClick={() => { setStep('upload'); setParsed(null) }}
              style={{
                backgroundColor: '#f9fafb', color: '#6b7280', padding: '12px 24px',
                borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px',
                fontWeight: '600', cursor: 'pointer',
              }}
            >
              Start Over
            </button>
          </div>

          {result && !result.success && (
            <div style={{
              backgroundColor: '#fef2f2', color: '#dc2626', padding: '12px 16px',
              borderRadius: '8px', fontSize: '14px', marginTop: '16px',
            }}>
              {result.message}
            </div>
          )}
        </div>
      )}

      {/* Done step */}
      {step === 'done' && result && (
        <div style={{
          backgroundColor: '#ffffff', borderRadius: '12px', padding: '64px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
          <div style={{ fontWeight: '700', color: '#0a2240', fontSize: '18px', marginBottom: '8px' }}>
            Import Complete!
          </div>
          <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '32px' }}>
            {result.message}
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <link href="/students" style={{
              backgroundColor: '#ff5120', color: '#ffffff', padding: '10px 24px',
              borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600',
            }}>
              View Students
            </link>
            <button
              onClick={() => { setStep('upload'); setParsed(null) }}
              style={{
                backgroundColor: '#f9fafb', color: '#6b7280', padding: '10px 24px',
                borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px',
                fontWeight: '600', cursor: 'pointer',
              }}
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  )
}