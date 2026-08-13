'use client'

/**
 * Bulk Student Import
 * ====================
 * Turns a Google Forms CSV export into rows in `students` / `guardians`, and
 * links guardians to the student(s) they belong to.
 *
 * The flow is three steps: Upload -> Preview -> Done.
 *
 *  1. Upload   - the staff member picks a CSV (PapaParse turns it into rows
 *                of plain strings, keyed by column header).
 *  2. Preview  - we parse + validate every row client-side and classify each
 *                one as "new" (will be imported), "duplicate" (student
 *                already exists in the database and will be skipped so we
 *                never create doubles when the same form export is
 *                re-uploaded), or "invalid" (missing/unreadable required
 *                data, also skipped). Nothing is written to the database
 *                yet, so staff can catch problems before anything happens.
 *  3. Done     - only the "new" rows are inserted. We report exactly what
 *                happened (counts + reasons for anything skipped) and let
 *                staff download a CSV of the skipped rows so nothing is
 *                silently lost.
 *
 * Guardian linking: the CSV's timestamp column (renamed to `created_at`) is
 * shared by a student and their guardian(s) because they come from the same
 * form submission. After inserting, we call the `link_guardians_to_students`
 * Postgres function, which matches rows on that shared timestamp. We then
 * double-check the links actually landed so we can flag anything that
 * didn't (e.g. a row with a missing timestamp) instead of failing silently.
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Papa from 'papaparse'
import Link from 'next/link'
import { downloadCsv } from '@/lib/csv'

type RawRow = Record<string, string>

type RowStatus = 'new' | 'duplicate' | 'invalid'

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

type ParsedRow = {
  rowNumber: number
  student: ParsedStudent
  guardians: ParsedGuardian[]
  rowStatus: RowStatus
  reasons: string[]
}

type ExistingStudent = {
  personal_email: string | null
  first_name: string
  last_name: string
  birthday: string | null
}

// ---------------------------------------------------------------------------
// Header + value parsing helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a CSV column header so minor formatting differences ("First
 * Name", "first-name", "  first_name ") all resolve to the same key
 * ("first_name"). This means staff don't have to hand-rename headers to an
 * exact match every time they export from Google Forms.
 */
function normalizeHeader(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function normalizeRow(row: RawRow): RawRow {
  const out: RawRow = {}
  for (const [key, value] of Object.entries(row)) {
    out[normalizeHeader(key)] = value
  }
  return out
}

function cleanString(val: string | undefined): string | null {
  const v = val?.trim()
  return v ? v : null
}

function parseBoolean(val: string | undefined): boolean | null {
  if (!val) return null
  const v = val.toLowerCase().trim()
  if (v === 'true' || v === 'yes') return true
  if (v === 'false' || v === 'no') return false
  return null
}

/**
 * Accepts either an already-ISO date ("2026-08-13") or the MM/DD/YYYY format
 * Google Forms/Sheets exports by default. Returns an error string instead of
 * silently passing through unparseable text — a malformed date used to be
 * sent straight to Postgres and could fail the entire insert batch with a
 * cryptic error.
 */
function parseDate(val: string | undefined): { value: string | null; error?: string } {
  const cleaned = val?.trim()
  if (!cleaned) return { value: null }

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return { value: cleaned }
  }

  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, month, day, year] = match
    const m = parseInt(month, 10)
    const d = parseInt(day, 10)
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      return { value: null, error: `Unrecognized birthday "${cleaned}"` }
    }
    return { value: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` }
  }

  return { value: null, error: `Unrecognized birthday format "${cleaned}" (expected MM/DD/YYYY)` }
}

/** Guards against the previous behavior where a bad graduation year became `NaN`, which Postgres rejects. */
function parseGradYear(val: string | undefined): { value: number | null; error?: string } {
  const cleaned = val?.trim()
  if (!cleaned) return { value: null }
  const n = parseInt(cleaned, 10)
  if (Number.isNaN(n) || n < 2000 || n > 2100) {
    return { value: null, error: `Unrecognized graduation year "${cleaned}"` }
  }
  return { value: n }
}

function normalizeNameKey(first: string, last: string, birthday: string | null): string {
  return `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}|${birthday ?? ''}`
}

// ---------------------------------------------------------------------------
// Row parsing + classification
// ---------------------------------------------------------------------------

function parseRows(rows: RawRow[]): ParsedRow[] {
  return rows.map((rawRow, i) => {
    const row = normalizeRow(rawRow)
    const reasons: string[] = []

    const first_name = cleanString(row['first_name']) ?? ''
    const last_name = cleanString(row['last_name']) ?? ''
    if (!first_name || !last_name) {
      reasons.push('Missing first or last name')
    }

    const birthday = parseDate(row['birthday'])
    if (birthday.error) reasons.push(birthday.error)

    const grad_year = parseGradYear(row['grad_year'])
    if (grad_year.error) reasons.push(grad_year.error)

    const created_at = cleanString(row['created_at'])
    if (!created_at) {
      reasons.push('Missing submission timestamp — guardians for this row may not auto-link')
    }

    const student: ParsedStudent = {
      first_name,
      last_name,
      birthday: birthday.value,
      gender: cleanString(row['gender']),
      pronouns: cleanString(row['pronouns']),
      race_ethnicity: cleanString(row['race_ethnicity']),
      primary_language: cleanString(row['primary_language']),
      school: cleanString(row['school']),
      grade_level: cleanString(row['grade_level']),
      grad_year: grad_year.value,
      personal_email: cleanString(row['personal_email']),
      phone_number: cleanString(row['phone_number']),
      street_address: cleanString(row['street_address']),
      city: cleanString(row['city']),
      zip_code: cleanString(row['zip_code']),
      free_reduced_lunch: parseBoolean(row['free_reduced_lunch']),
      dietary_restrictions: cleanString(row['dietary_restrictions']),
      shirt_size: cleanString(row['shirt_size']),
      IEP_504: cleanString(row['iep_or_504']),
      iep_504_details: cleanString(row['iep_504_details']),
      status: 'active',
      created_at,
    }

    const guardians: ParsedGuardian[] = []
    if (cleanString(row['guardian_first_name'])) {
      guardians.push({
        first_name: row['guardian_first_name'].trim(),
        last_name: cleanString(row['guardian_last_name']) ?? '',
        phone_number: cleanString(row['guardian_phone_number']),
        email: cleanString(row['guardian_email']),
        relationship: cleanString(row['guardian_relationship']),
        created_at,
      })
    }
    if (cleanString(row['secondary_first_name'])) {
      guardians.push({
        first_name: row['secondary_first_name'].trim(),
        last_name: cleanString(row['secondary_last_name']) ?? '',
        phone_number: cleanString(row['secondary_phone_number']),
        email: cleanString(row['secondary_email']),
        relationship: cleanString(row['secondary_relationship']),
        created_at,
      })
    }

    // "invalid" (missing name, unparseable date/year) always wins over
    // "duplicate" — those get classified against the database separately.
    const rowStatus: RowStatus = reasons.some(r => !r.startsWith('Missing submission timestamp'))
      ? 'invalid'
      : 'new'

    return { rowNumber: i + 2 /* account for header row + 1-indexing */, student, guardians, rowStatus, reasons }
  })
}

/**
 * Marks rows as duplicates against students already in the database, so
 * re-uploading the same (or an overlapping) Google Form export doesn't
 * create doubles. A row matches an existing student if either its email
 * matches, or its full name + birthday matches.
 */
function markDuplicates(rows: ParsedRow[], existing: ExistingStudent[]): ParsedRow[] {
  const emailSet = new Set(
    existing.map(s => s.personal_email?.trim().toLowerCase()).filter((e): e is string => !!e)
  )
  const nameDateSet = new Set(
    existing.map(s => normalizeNameKey(s.first_name, s.last_name, s.birthday))
  )

  return rows.map(row => {
    if (row.rowStatus === 'invalid') return row

    const email = row.student.personal_email?.trim().toLowerCase()
    const nameKey = normalizeNameKey(row.student.first_name, row.student.last_name, row.student.birthday)
    const isDuplicate = (!!email && emailSet.has(email)) || nameDateSet.has(nameKey)

    if (isDuplicate) {
      return {
        ...row,
        rowStatus: 'duplicate' as const,
        reasons: [...row.reasons, 'Already in the database — skipped to avoid a duplicate'],
      }
    }
    return row
  })
}

// Fields worth surfacing in the completeness check. Excludes internal/status
// fields that aren't meant to come from the CSV.
const COMPLETENESS_FIELDS: { key: keyof ParsedStudent; label: string }[] = [
  { key: 'birthday', label: 'Birthday' },
  { key: 'gender', label: 'Gender' },
  { key: 'school', label: 'School' },
  { key: 'grade_level', label: 'Grade Level' },
  { key: 'grad_year', label: 'Graduation Year' },
  { key: 'personal_email', label: 'Personal Email' },
  { key: 'phone_number', label: 'Phone Number' },
  { key: 'street_address', label: 'Street Address' },
  { key: 'city', label: 'City' },
  { key: 'zip_code', label: 'Zip Code' },
  { key: 'IEP_504', label: 'IEP / 504' },
]

type FieldCompleteness = { label: string; filled: number; total: number; pct: number }

/**
 * For every field we expect from the CSV, counts how many parsed rows
 * actually have a value. A field sitting at (or near) 0% across every row
 * almost always means the CSV's column header didn't match what we expect
 * — not that the data is genuinely blank — so staff can catch a mapping
 * problem in one upload instead of importing, noticing, and re-importing.
 */
function computeFieldCompleteness(rows: ParsedRow[]): FieldCompleteness[] {
  const total = rows.length
  if (total === 0) return []

  const studentFields = COMPLETENESS_FIELDS.map(({ key, label }) => {
    const filled = rows.filter(r => {
      const v = r.student[key]
      return v !== null && v !== undefined && v !== ''
    }).length
    return { label, filled, total, pct: Math.round((filled / total) * 100) }
  })

  const guardianFilled = rows.filter(r => r.guardians.length > 0).length
  const timestampFilled = rows.filter(r => !!r.student.created_at).length

  return [
    ...studentFields,
    { label: 'Guardian Info', filled: guardianFilled, total, pct: Math.round((guardianFilled / total) * 100) },
    { label: 'Submission Timestamp', filled: timestampFilled, total, pct: Math.round((timestampFilled / total) * 100) },
  ].sort((a, b) => a.pct - b.pct)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ImportResult = {
  success: boolean
  message: string
  insertedStudents: number
  insertedGuardians: number
  unlinkedGuardians: number
}

export default function ImportPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setCheckingDuplicates(true)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rawRows = results.data as RawRow[]
        const parsedRows = parseRows(rawRows)

        // Check parsed rows against students already in the database so
        // we can flag duplicates before anything is imported.
        const { data: existing, error: fetchError } = await supabase
          .from('students')
          .select('personal_email, first_name, last_name, birthday')

        const withDuplicates = fetchError ? parsedRows : markDuplicates(parsedRows, existing ?? [])

        setRows(withDuplicates)
        setStep('preview')
        setCheckingDuplicates(false)
      }
    })
  }

  async function handleImport() {
    if (!rows) return
    setLoading(true)
    setResult(null)

    const newRows = rows.filter(r => r.rowStatus === 'new')
    const studentsToInsert = newRows.map(r => r.student)
    const guardiansToInsert = newRows.flatMap(r => r.guardians)

    try {
      if (studentsToInsert.length === 0) {
        setResult({
          success: true,
          message: 'No new students to import — everything in this file was a duplicate or invalid.',
          insertedStudents: 0,
          insertedGuardians: 0,
          unlinkedGuardians: 0,
        })
        setStep('done')
        setLoading(false)
        return
      }

      // Insert students, returning their ids + created_at so we can verify
      // guardian linking afterwards.
      const { data: insertedStudents, error: studentError } = await supabase
        .from('students')
        .insert(studentsToInsert)
        .select('id, created_at')

      if (studentError) throw new Error(`Student import failed: ${studentError.message}`)

      let insertedGuardianCount = 0
      let unlinkedGuardians = 0

      if (guardiansToInsert.length > 0) {
        const { error: guardianError } = await supabase
          .from('guardians')
          .insert(guardiansToInsert)

        if (guardianError) throw new Error(`Guardian import failed: ${guardianError.message}`)
        insertedGuardianCount = guardiansToInsert.length

        const { error: linkError } = await supabase.rpc('link_guardians_to_students')
        if (linkError) console.warn('Linking warning:', linkError.message)

        // Verify every newly-inserted student that expected a guardian
        // actually got linked, so a silent RPC failure doesn't go unnoticed.
        const studentIds = (insertedStudents ?? []).map(s => s.id)
        const expectedLinks = newRows.filter(r => r.guardians.length > 0).length
        if (studentIds.length > 0 && expectedLinks > 0) {
          const { data: links } = await supabase
            .from('student_guardians')
            .select('student_id')
            .in('student_id', studentIds)
          const linkedStudentIds = new Set((links ?? []).map(l => l.student_id))
          unlinkedGuardians = newRows.filter(
            r => r.guardians.length > 0 && !linkedStudentIds.has(insertedStudents?.[newRows.indexOf(r)]?.id)
          ).length
        }
      }

      setResult({
        success: true,
        message: `Successfully imported ${studentsToInsert.length} student${studentsToInsert.length === 1 ? '' : 's'} and ${insertedGuardianCount} guardian${insertedGuardianCount === 1 ? '' : 's'}.`,
        insertedStudents: studentsToInsert.length,
        insertedGuardians: insertedGuardianCount,
        unlinkedGuardians,
      })
      setStep('done')
    } catch (err) {
      setResult({
        success: false,
        message: (err as Error).message,
        insertedStudents: 0,
        insertedGuardians: 0,
        unlinkedGuardians: 0,
      })
    }

    setLoading(false)
  }

  function handleDownloadSkipped() {
    if (!rows) return
    const skipped = rows.filter(r => r.rowStatus !== 'new')
    downloadCsv('skipped_rows.csv', skipped.map(r => ({
      row: r.rowNumber,
      status: r.rowStatus,
      first_name: r.student.first_name,
      last_name: r.student.last_name,
      reasons: r.reasons.join('; '),
    })))
  }

  function reset() {
    setStep('upload')
    setRows(null)
    setResult(null)
  }

  const newCount = rows?.filter(r => r.rowStatus === 'new').length ?? 0
  const duplicateCount = rows?.filter(r => r.rowStatus === 'duplicate').length ?? 0
  const invalidCount = rows?.filter(r => r.rowStatus === 'invalid').length ?? 0
  const guardianCount = rows?.filter(r => r.rowStatus === 'new').flatMap(r => r.guardians).length ?? 0
  const completeness = rows ? computeFieldCompleteness(rows) : []

  const statusColors: Record<RowStatus, { bg: string; text: string; label: string }> = {
    new: { bg: '#f0fdf4', text: '#16a34a', label: 'New' },
    duplicate: { bg: '#fffbeb', text: '#b45309', label: 'Duplicate' },
    invalid: { bg: '#fef2f2', text: '#dc2626', label: 'Invalid' },
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
            {checkingDuplicates ? 'Checking for duplicates…' : 'Upload your CSV file'}
          </div>
          <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
            Column headers are matched case- and spacing-insensitively, so exact renaming isn&apos;t required.
          </div>
          <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '32px' }}>
            Refer to the Import Guide for the full list of expected column names.
          </div>
          <label style={{
            backgroundColor: checkingDuplicates ? '#9ca3af' : '#ff5120', color: '#ffffff', padding: '12px 32px',
            borderRadius: '8px', fontSize: '14px', fontWeight: '600',
            cursor: checkingDuplicates ? 'not-allowed' : 'pointer', display: 'inline-block',
          }}>
            Choose CSV File
            <input type="file" accept=".csv" onChange={handleFile} disabled={checkingDuplicates} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* Preview step */}
      {step === 'preview' && rows && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'New students', value: newCount, color: '#16a34a' },
              { label: 'Guardians to import', value: guardianCount, color: '#5eb3e4' },
              { label: 'Duplicates (skipped)', value: duplicateCount, color: '#b45309' },
              { label: 'Invalid rows (skipped)', value: invalidCount, color: '#dc2626' },
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

          {/* Field completeness — catches header-mapping mistakes before import */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 4px 0' }}>
              Field Completeness
            </h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 16px 0' }}>
              A field stuck at 0% almost always means its column header didn&apos;t match — not that every row is genuinely blank.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px 24px' }}>
              {completeness.map(f => (
                <div key={f.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: '#0a2240', fontWeight: '600' }}>{f.label}</span>
                    <span style={{ color: f.pct === 0 ? '#dc2626' : '#6b7280', fontWeight: f.pct === 0 ? '700' : '400' }}>
                      {f.filled}/{f.total} ({f.pct}%)
                    </span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '3px', backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${f.pct}%`,
                      backgroundColor: f.pct === 0 ? '#dc2626' : f.pct < 50 ? '#f59e0b' : '#16a34a',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row-by-row preview */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '24px',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
                Row Preview
              </h2>
              {(duplicateCount + invalidCount) > 0 && (
                <button onClick={handleDownloadSkipped} style={{
                  background: 'none', border: 'none', color: '#5eb3e4', fontSize: '13px',
                  fontWeight: '600', cursor: 'pointer',
                }}>
                  Download skipped rows (.csv)
                </button>
              )}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Row', 'Status', 'Name', 'Birthday', 'School', 'Grade', 'Email', 'Notes'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left', fontSize: '11px',
                        fontWeight: '600', color: '#6b7280', textTransform: 'uppercase',
                        letterSpacing: '0.5px', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#f9fafb',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const c = statusColors[r.rowStatus]
                    return (
                      <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>{r.rowNumber}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            backgroundColor: c.bg, color: c.text, fontSize: '11px', fontWeight: '600',
                            padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px',
                          }}>
                            {c.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#0a2240' }}>
                          {r.student.first_name || '—'} {r.student.last_name}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{r.student.birthday ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{r.student.school ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{r.student.grade_level ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{r.student.personal_email ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: r.rowStatus === 'invalid' ? '#dc2626' : '#9ca3af' }}>
                          {r.reasons.join('; ') || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleImport}
              disabled={loading || newCount === 0}
              style={{
                backgroundColor: (loading || newCount === 0) ? '#9ca3af' : '#ff5120',
                color: '#ffffff', padding: '12px 32px', borderRadius: '8px',
                border: 'none', fontSize: '14px', fontWeight: '600',
                cursor: (loading || newCount === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Importing...' : `Import ${newCount} Student${newCount === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={reset}
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>{result.success ? '🎉' : '⚠️'}</div>
          <div style={{ fontWeight: '700', color: '#0a2240', fontSize: '18px', marginBottom: '8px' }}>
            {result.success ? 'Import Complete!' : 'Import Failed'}
          </div>
          <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
            {result.message}
          </div>
          {(duplicateCount + invalidCount) > 0 && (
            <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '16px' }}>
              {duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'} and {invalidCount} invalid row{invalidCount === 1 ? '' : 's'} were skipped.{' '}
              <button onClick={handleDownloadSkipped} style={{ background: 'none', border: 'none', color: '#5eb3e4', fontWeight: '600', cursor: 'pointer', padding: 0, fontSize: '13px' }}>
                Download the list.
              </button>
            </div>
          )}
          {result.unlinkedGuardians > 0 && (
            <div style={{
              backgroundColor: '#fffbeb', color: '#b45309', padding: '12px 16px',
              borderRadius: '8px', fontSize: '13px', marginBottom: '32px', display: 'inline-block',
            }}>
              {result.unlinkedGuardians} student{result.unlinkedGuardians === 1 ? '' : 's'} had guardians that didn&apos;t auto-link (usually a missing timestamp) — link them manually from the student&apos;s profile.
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
            <Link href="/students" style={{
              backgroundColor: '#ff5120', color: '#ffffff', padding: '10px 24px',
              borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600',
            }}>
              View Students
            </Link>
            <button
              onClick={reset}
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
