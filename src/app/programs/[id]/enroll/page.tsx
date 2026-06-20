'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type Student = {
  id: string
  first_name: string
  last_name: string
  student_code: string
  school: string | null
}

export default function EnrollStudentPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const programId = params.id as string

  const [students, setStudents] = useState<Student[]>([])
  const [filtered, setFiltered] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Student | null>(null)
  const [enrollmentDate, setEnrollmentDate] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [program, setProgram] = useState<{ name: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: programData } = await supabase
        .from('programs')
        .select('name')
        .eq('id', programId)
        .single()
      setProgram(programData)

      // Get students not already enrolled in this program
      const { data: enrolled } = await supabase
        .from('student_programs')
        .select('student_id')
        .eq('program_id', programId)
        .is('exit_date', null)

      const enrolledIds = enrolled?.map(e => e.student_id) ?? []

      const { data: studentData } = await supabase
        .from('students')
        .select('id, first_name, last_name, student_code, school')
        .eq('status', 'active')
        .order('last_name', { ascending: true })

      const available = (studentData ?? []).filter(s => !enrolledIds.includes(s.id))
      setStudents(available)
      setFiltered(available)
    }
    load()
  }, [programId])

  useEffect(() => {
    if (!search) {
      setFiltered(students)
      return
    }
    const q = search.toLowerCase()
    setFiltered(students.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      s.student_code?.toLowerCase().includes(q) ||
      s.school?.toLowerCase().includes(q)
    ))
  }, [search, students])

  async function handleEnroll() {
    if (!selected) {
      setError('Please select a student.')
      return
    }
    if (!enrollmentDate) {
      setError('Please enter an enrollment date.')
      return
    }

    setLoading(true)
    setError(null)

    const { error } = await supabase
      .from('student_programs')
      .insert({
        student_id: selected.id,
        program_id: programId,
        enrollment_date: enrollmentDate,
        notes: notes || null,
      })

    if (error) {
      setError(error.message)
      setLoading(false)
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
    backgroundColor: '#ffffff',
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
      {/* Back link */}
      <Link href={`/programs/${programId}`} style={{
        color: '#6b7280',
        fontSize: '13px',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginBottom: '12px',
      }}>
        ← Back to Program
      </Link>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
          Enroll Student
        </h1>
        {program && (
          <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>
            Adding to: <span style={{ color: '#ff5120', fontWeight: '600' }}>{program.name}</span>
          </p>
        )}
      </div>

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

          {/* Student search */}
          <div>
            <label style={labelStyle}>Search Student *</label>
            <input
              type="text"
              placeholder="Search by name, code, or school..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelected(null)
              }}
              style={inputStyle}
            />

            {/* Search results */}
            {search && !selected && (
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                marginTop: '4px',
                overflow: 'hidden',
                maxHeight: '200px',
                overflowY: 'auto',
              }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '12px 16px', color: '#9ca3af', fontSize: '14px' }}>
                    No students found
                  </div>
                ) : (
                  filtered.map((student) => (
                    <div
                      key={student.id}
                      onClick={() => {
                        setSelected(student)
                        setSearch(`${student.first_name} ${student.last_name}`)
                      }}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <div style={{ fontWeight: '600', color: '#0a2240', fontSize: '14px' }}>
                        {student.first_name} {student.last_name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {student.student_code} {student.school ? `· ${student.school}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Selected student confirmation */}
            {selected && (
              <div style={{
                marginTop: '8px',
                padding: '12px 16px',
                backgroundColor: '#f0fdf4',
                borderRadius: '8px',
                border: '1px solid #bbf7d0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#0a2240', fontSize: '14px' }}>
                    ✓ {selected.first_name} {selected.last_name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {selected.student_code}
                  </div>
                </div>
                <button
                  onClick={() => { setSelected(null); setSearch('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    fontSize: '18px',
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* Enrollment date */}
          <div>
            <label style={labelStyle}>Enrollment Date *</label>
            <input
              type="date"
              value={enrollmentDate}
              onChange={(e) => setEnrollmentDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this enrollment..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
          <button
            onClick={handleEnroll}
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
            {loading ? 'Enrolling...' : 'Enroll Student'}
          </button>
          <Link href={`/programs/${programId}`} style={{
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