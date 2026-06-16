'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

type Student = {
  id: string
  first_name: string
  last_name: string
  student_code: string
  school: string | null
  grade_level: string | null
  status: string | null
  created_at: string
}

export default function StudentsPage() {
  const supabase = createClient()
  const [students, setStudents] = useState<Student[]>([])
  const [filtered, setFiltered] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Session:', session?.user?.email)
      if (!session) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      setRole(profile?.role ?? null)

      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, student_code, school, grade_level, status, created_at')
        .order('last_name', { ascending: true })

      console.log('Students data:', data)
      console.log('Students error:', error)

      setStudents(data ?? [])
      setFiltered(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

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

  return (
    <div>
      {/* Page header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
            Students
          </h1>
          <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>
            {filtered.length} of {students.length} students
          </p>
        </div>
        {role === 'admin' && (
          <Link href="/students/new" style={{
            backgroundColor: '#ff5120',
            color: '#ffffff',
            padding: '10px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '600',
          }}>
            + Add Student
          </Link>
        )}
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search by name, student code, or school..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: '14px',
            color: '#0a2240',
            outline: 'none',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
          }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '48px',
          textAlign: 'center',
          color: '#9ca3af',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          Loading students...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '64px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎓</div>
          <div style={{ color: '#0a2240', fontWeight: '600', marginBottom: '8px' }}>
            {search ? 'No students match your search' : 'No students yet'}
          </div>
          <div style={{ color: '#9ca3af', fontSize: '14px' }}>
            {search ? 'Try a different search term.' : 'Add your first student to get started.'}
          </div>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Name', 'Code', 'School', 'Grade', 'Status', 'Joined'].map((h) => (
                  <th key={h} style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((student, i) => (
                <tr key={student.id} style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none',
                  cursor: 'pointer',
                }}>
                  <td style={{ padding: '14px 16px' }}>
                    <Link href={`/students/${student.id}`} style={{
                      color: '#0a2240',
                      fontWeight: '600',
                      fontSize: '14px',
                      textDecoration: 'none',
                    }}>
                      {student.first_name} {student.last_name}
                    </Link>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#5eb3e4', fontWeight: '600' }}>
                    {student.student_code}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                    {student.school ?? '—'}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                    {student.grade_level ?? '—'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      backgroundColor: student.status === 'active' ? '#f0fdf4' : '#f9fafb',
                      color: student.status === 'active' ? '#16a34a' : '#9ca3af',
                      fontSize: '11px',
                      fontWeight: '600',
                      padding: '3px 10px',
                      borderRadius: '20px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {student.status ?? 'unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                    {new Date(student.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}