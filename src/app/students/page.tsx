'use client'

/**
 * Students list.
 *
 * Beyond the original name/code/school search, this page adds:
 *  - Dropdown filters (status, school, grade, IEP/504) built from whatever
 *    values actually exist in the data, so they stay accurate as records
 *    are added.
 *  - Row checkboxes + a bulk action bar for changing status or enrolling a
 *    group of students in a program at once, instead of one profile at a
 *    time.
 *  - CSV export — exports the current selection if anything is checked,
 *    otherwise whatever the filters/search currently show.
 */

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { downloadCsv } from '@/lib/csv'
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
  birthday: string | null
  gender: string | null
  personal_email: string | null
  phone_number: string | null
  IEP_504: string | null
}

type Program = { id: string; name: string }

const STATUS_OPTIONS = ['active', 'inactive', 'graduated', 'withdrawn']

export default function StudentsPage() {
  const supabase = createClient()
  const [students, setStudents] = useState<Student[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [iepFilter, setIepFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Bulk action UI state
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkProgramId, setBulkProgramId] = useState('')
  const [bulkEnrollDate, setBulkEnrollDate] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
    setRole(profile?.role ?? null)

    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, student_code, school, grade_level, status, created_at, birthday, gender, personal_email, phone_number, IEP_504')
      .order('last_name', { ascending: true })
    setStudents(data ?? [])

    const { data: programData } = await supabase
      .from('programs')
      .select('id, name')
      .order('name', { ascending: true })
    setPrograms(programData ?? [])

    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Distinct filter option lists, derived from the data itself so they
  // never drift out of sync with what's actually in the database.
  const schoolOptions = useMemo(
    () => Array.from(new Set(students.map(s => s.school).filter((s): s is string => !!s))).sort(),
    [students]
  )
  const gradeOptions = useMemo(
    () => Array.from(new Set(students.map(s => s.grade_level).filter((g): g is string => !!g))).sort(),
    [students]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return students.filter(s => {
      if (q) {
        const matches = `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
          s.student_code?.toLowerCase().includes(q) ||
          s.school?.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (statusFilter && s.status !== statusFilter) return false
      if (schoolFilter && s.school !== schoolFilter) return false
      if (gradeFilter && s.grade_level !== gradeFilter) return false
      if (iepFilter && (s.IEP_504 ?? '') !== iepFilter) return false
      return true
    })
  }, [students, search, statusFilter, schoolFilter, gradeFilter, iepFilter])

  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id))

  function toggleSelectAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filtered.forEach(s => next.delete(s.id))
      } else {
        filtered.forEach(s => next.add(s.id))
      }
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setSchoolFilter('')
    setGradeFilter('')
    setIepFilter('')
  }

  function handleExport() {
    const rows = selected.size > 0 ? students.filter(s => selected.has(s.id)) : filtered
    downloadCsv(
      selected.size > 0 ? 'students_selected.csv' : 'students_export.csv',
      rows.map(s => ({
        first_name: s.first_name,
        last_name: s.last_name,
        student_code: s.student_code,
        birthday: s.birthday ?? '',
        gender: s.gender ?? '',
        school: s.school ?? '',
        grade_level: s.grade_level ?? '',
        status: s.status ?? '',
        personal_email: s.personal_email ?? '',
        phone_number: s.phone_number ?? '',
        iep_or_504: s.IEP_504 ?? '',
        created_at: s.created_at,
      }))
    )
  }

  async function handleBulkStatus() {
    if (!bulkStatus || selected.size === 0) return
    if (!confirm(`Set status to "${bulkStatus}" for ${selected.size} student${selected.size === 1 ? '' : 's'}?`)) return

    setBulkBusy(true)
    setBulkMessage(null)
    const ids = Array.from(selected)
    const { error } = await supabase.from('students').update({ status: bulkStatus }).in('id', ids)

    if (error) {
      setBulkMessage(`Failed: ${error.message}`)
    } else {
      setBulkMessage(`Updated status for ${ids.length} student${ids.length === 1 ? '' : 's'}.`)
      setSelected(new Set())
      setBulkStatus('')
      await load()
    }
    setBulkBusy(false)
  }

  async function handleBulkEnroll() {
    if (!bulkProgramId || !bulkEnrollDate || selected.size === 0) return
    const program = programs.find(p => p.id === bulkProgramId)
    if (!confirm(`Enroll ${selected.size} student${selected.size === 1 ? '' : 's'} in "${program?.name}"?`)) return

    setBulkBusy(true)
    setBulkMessage(null)
    const ids = Array.from(selected)

    // Don't double-enroll students who already have an active enrollment
    // in this program.
    const { data: existing } = await supabase
      .from('student_programs')
      .select('student_id')
      .eq('program_id', bulkProgramId)
      .is('exit_date', null)
      .in('student_id', ids)

    const alreadyEnrolled = new Set((existing ?? []).map(e => e.student_id))
    const toEnroll = ids.filter(id => !alreadyEnrolled.has(id))

    if (toEnroll.length === 0) {
      setBulkMessage('Everyone selected is already enrolled in that program.')
      setBulkBusy(false)
      return
    }

    const { error } = await supabase.from('student_programs').insert(
      toEnroll.map(student_id => ({
        student_id,
        program_id: bulkProgramId,
        enrollment_date: bulkEnrollDate,
      }))
    )

    if (error) {
      setBulkMessage(`Failed: ${error.message}`)
    } else {
      const skipped = ids.length - toEnroll.length
      setBulkMessage(
        `Enrolled ${toEnroll.length} student${toEnroll.length === 1 ? '' : 's'}` +
        (skipped > 0 ? ` (${skipped} already enrolled, skipped).` : '.')
      )
      setSelected(new Set())
      setBulkProgramId('')
      setBulkEnrollDate('')
    }
    setBulkBusy(false)
  }

  const selectStyle = {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    fontSize: '13px',
    color: '#0a2240',
    backgroundColor: '#ffffff',
    outline: 'none',
  }

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
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleExport} style={{
            backgroundColor: '#f9fafb', color: '#0a2240', padding: '10px 20px',
            borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer',
          }}>
            Export {selected.size > 0 ? `(${selected.size})` : 'CSV'}
          </button>
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
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by name, student code, or school..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 240px',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: '14px',
            color: '#0a2240',
            outline: 'none',
            backgroundColor: '#ffffff',
          }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)} style={selectStyle}>
          <option value="">All Schools</option>
          {schoolOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} style={selectStyle}>
          <option value="">All Grades</option>
          {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={iepFilter} onChange={e => setIepFilter(e.target.value)} style={selectStyle}>
          <option value="">IEP / 504: Any</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
          <option value="Maybe">Maybe</option>
        </select>
        {(search || statusFilter || schoolFilter || gradeFilter || iepFilter) && (
          <button onClick={clearFilters} style={{
            background: 'none', border: 'none', color: '#5eb3e4', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer', padding: '10px 4px',
          }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px',
          padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center',
          gap: '16px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#0a2240' }}>
            {selected.size} selected
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} style={selectStyle}>
              <option value="">Change status to…</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
            <button onClick={handleBulkStatus} disabled={!bulkStatus || bulkBusy} style={{
              backgroundColor: (!bulkStatus || bulkBusy) ? '#9ca3af' : '#0a2240', color: '#fff',
              padding: '9px 16px', borderRadius: '8px', border: 'none', fontSize: '13px',
              fontWeight: '600', cursor: (!bulkStatus || bulkBusy) ? 'not-allowed' : 'pointer',
            }}>
              Apply
            </button>
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select value={bulkProgramId} onChange={e => setBulkProgramId(e.target.value)} style={selectStyle}>
              <option value="">Enroll in program…</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input
              type="date"
              value={bulkEnrollDate}
              onChange={e => setBulkEnrollDate(e.target.value)}
              style={{ ...selectStyle, padding: '9px 12px' }}
            />
            <button onClick={handleBulkEnroll} disabled={!bulkProgramId || !bulkEnrollDate || bulkBusy} style={{
              backgroundColor: (!bulkProgramId || !bulkEnrollDate || bulkBusy) ? '#9ca3af' : '#ff5120', color: '#fff',
              padding: '9px 16px', borderRadius: '8px', border: 'none', fontSize: '13px',
              fontWeight: '600', cursor: (!bulkProgramId || !bulkEnrollDate || bulkBusy) ? 'not-allowed' : 'pointer',
            }}>
              Apply
            </button>
          </span>

          <button onClick={() => setSelected(new Set())} style={{
            background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', marginLeft: 'auto',
          }}>
            Clear selection
          </button>
        </div>
      )}
      {bulkMessage && (
        <div style={{
          backgroundColor: bulkMessage.startsWith('Failed') ? '#fef2f2' : '#f0fdf4',
          color: bulkMessage.startsWith('Failed') ? '#dc2626' : '#16a34a',
          padding: '10px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px',
        }}>
          {bulkMessage}
        </div>
      )}

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
                <th style={{ padding: '12px 16px', width: '32px' }}>
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
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
                  backgroundColor: selected.has(student.id) ? '#f0f9ff' : 'transparent',
                }}>
                  <td style={{ padding: '14px 16px' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(student.id)}
                      onChange={() => toggleSelect(student.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
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
