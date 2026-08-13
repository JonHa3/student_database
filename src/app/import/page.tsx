'use client'

/**
 * Bulk Student Import
 * ====================
 * Turns a Google Forms CSV export into rows in `students` / `guardians`, and
 * links guardians to the student(s) they belong to.
 *
 * The flow is four steps: Upload -> Map Columns -> Preview -> Done.
 *
 *  1. Upload      - the staff member picks a CSV (PapaParse turns it into
 *                   rows of plain strings, keyed by the file's own column
 *                   headers — whatever Google Forms happened to export).
 *  2. Map Columns - every CSV column is matched against our known fields
 *                   using fuzzy text matching (see "Column matching" below),
 *                   pre-filling a best guess for each one. Staff review and
 *                   fix the mapping before anything is parsed, which is what
 *                   removes the old requirement to hand-rename headers to an
 *                   exact match before every import.
 *  3. Preview     - using the confirmed mapping, we parse + validate every
 *                   row and classify each one as "new" (will be imported),
 *                   "duplicate" (student already exists in the database and
 *                   will be skipped so we never create doubles when the same
 *                   form export is re-uploaded), or "invalid" (missing/
 *                   unreadable required data, also skipped). Nothing is
 *                   written to the database yet.
 *  4. Done        - only the "new" rows are inserted. We report exactly what
 *                   happened and let staff download a CSV of anything
 *                   skipped, so nothing is silently lost.
 *
 * Column matching: rather than a machine-learning model (overkill for a
 * small, fixed vocabulary, and would mean standing up a separate Python
 * service just for this), each target field lists a handful of known
 * phrasings ("aliases"). An incoming CSV header is scored against every
 * field's label + aliases using simple token overlap (think: an F1 score
 * over shared words), with an edit-distance fallback for single-word typos.
 * The highest-scoring, non-conflicting pairs become the suggested mapping —
 * see `suggestMapping` below. If your form's wording isn't matching well,
 * add more phrasings to `MAPPABLE_FIELDS`; no retraining required.
 *
 * Guardian linking: the CSV's timestamp column (mapped to `created_at`) is
 * shared by a student and their guardian(s) because they come from the same
 * form submission. After inserting, we call the `link_guardians_to_students`
 * Postgres function, which matches rows on that shared timestamp. We then
 * double-check the links actually landed so we can flag anything that
 * didn't (e.g. a row with a missing timestamp) instead of failing silently.
 */

import { useState, useMemo } from 'react'
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
// Target fields + fuzzy column matching
// ---------------------------------------------------------------------------

type FieldDef = { key: string; label: string; required?: boolean; aliases: string[] }

/**
 * Every field the import understands, with a few known phrasings each.
 * `suggestMapping` scores incoming CSV headers against these — extend the
 * alias lists here if a form's wording keeps needing manual correction.
 */
const MAPPABLE_FIELDS: FieldDef[] = [
  { key: 'first_name', label: 'Student First Name', required: true, aliases: ['first name', 'student first name', 'child first name', 'legal first name'] },
  { key: 'last_name', label: 'Student Last Name', required: true, aliases: ['last name', 'student last name', 'child last name', 'legal last name', 'surname'] },
  { key: 'birthday', label: 'Birthday', aliases: ['birthday', 'date of birth', 'dob', 'birth date'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'] },
  { key: 'pronouns', label: 'Pronouns', aliases: ['pronouns'] },
  { key: 'race_ethnicity', label: 'Race / Ethnicity', aliases: ['race ethnicity', 'race', 'ethnicity'] },
  { key: 'primary_language', label: 'Primary Language', aliases: ['primary language', 'home language', 'language spoken at home'] },
  { key: 'school', label: 'School', aliases: ['school', 'school name', 'current school'] },
  { key: 'grade_level', label: 'Grade Level', aliases: ['grade level', 'grade', 'current grade'] },
  { key: 'grad_year', label: 'Graduation Year', aliases: ['grad year', 'graduation year', 'expected graduation year'] },
  { key: 'personal_email', label: 'Student Email', aliases: ['personal email', 'student email', 'email address', 'email'] },
  { key: 'phone_number', label: 'Student Phone', aliases: ['phone number', 'student phone', 'cell phone', 'mobile number'] },
  { key: 'street_address', label: 'Street Address', aliases: ['street address', 'address', 'home address', 'mailing address'] },
  { key: 'city', label: 'City', aliases: ['city'] },
  { key: 'zip_code', label: 'Zip Code', aliases: ['zip code', 'zip', 'postal code'] },
  { key: 'free_reduced_lunch', label: 'Free / Reduced Lunch', aliases: ['free reduced lunch', 'free or reduced lunch', 'lunch program', 'frl'] },
  { key: 'dietary_restrictions', label: 'Dietary Restrictions', aliases: ['dietary restrictions', 'allergies', 'food allergies', 'dietary needs'] },
  { key: 'shirt_size', label: 'T-Shirt Size', aliases: ['shirt size', 't shirt size', 'tshirt size'] },
  { key: 'iep_or_504', label: 'IEP / 504', aliases: ['iep or 504', 'iep 504', '504 plan', 'has an iep or 504 plan'] },
  { key: 'iep_504_details', label: 'IEP / 504 Details', aliases: ['iep 504 details', 'iep details', 'accommodation details'] },
  { key: 'created_at', label: 'Submission Timestamp', aliases: ['created at', 'timestamp', 'submitted at', 'submission time', 'time stamp'] },
  { key: 'guardian_first_name', label: 'Guardian First Name', aliases: ['guardian first name', 'parent first name', 'primary guardian first name'] },
  { key: 'guardian_last_name', label: 'Guardian Last Name', aliases: ['guardian last name', 'parent last name', 'primary guardian last name'] },
  { key: 'guardian_phone_number', label: 'Guardian Phone', aliases: ['guardian phone number', 'parent phone number', 'guardian phone'] },
  { key: 'guardian_email', label: 'Guardian Email', aliases: ['guardian email', 'parent email'] },
  { key: 'guardian_relationship', label: 'Guardian Relationship', aliases: ['guardian relationship', 'relationship to student', 'relationship'] },
  { key: 'secondary_first_name', label: 'Secondary Contact First Name', aliases: ['secondary first name', 'secondary contact first name', 'emergency contact first name'] },
  { key: 'secondary_last_name', label: 'Secondary Contact Last Name', aliases: ['secondary last name', 'secondary contact last name', 'emergency contact last name'] },
  { key: 'secondary_phone_number', label: 'Secondary Contact Phone', aliases: ['secondary phone number', 'secondary contact phone', 'emergency contact phone'] },
  { key: 'secondary_email', label: 'Secondary Contact Email', aliases: ['secondary email', 'secondary contact email', 'emergency contact email'] },
  { key: 'secondary_relationship', label: 'Secondary Contact Relationship', aliases: ['secondary relationship', 'secondary contact relationship'] },
]

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenize(s: string): string[] {
  return normalizeForMatch(s).split(' ').filter(Boolean)
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

/**
 * Scores how likely `sourceHeader` (a raw CSV column name) refers to the
 * same concept as `alias` (one known phrasing of a target field), from 0
 * (unrelated) to 1 (same). Token-overlap based — like an F1 score over
 * shared words — so word order and filler words ("What is the student's
 * ...?") don't throw it off, with a Levenshtein fallback so a single-word
 * typo ("adress") still matches.
 */
function similarity(sourceHeader: string, alias: string): number {
  const sTokens = tokenize(sourceHeader)
  const aTokens = tokenize(alias)
  if (sTokens.length === 0 || aTokens.length === 0) return 0

  const overlap = sTokens.filter(t => aTokens.includes(t)).length
  if (overlap > 0) {
    const coverage = overlap / aTokens.length   // how much of the target concept is present
    const precision = overlap / sTokens.length  // how much of the source header is explained by it
    return (coverage + precision) / 2
  }

  if (sTokens.length === 1 && aTokens.length === 1) {
    const dist = levenshtein(sTokens[0], aTokens[0])
    const maxLen = Math.max(sTokens[0].length, aTokens[0].length)
    return Math.max(0, 1 - dist / maxLen)
  }

  return 0
}

const MATCH_CONFIDENCE_THRESHOLD = 0.5

type SuggestedMatch = { field: string; score: number } | null

/**
 * Suggests a target field for every raw CSV header. Scores every
 * (header, field) pair, then greedily assigns the best-scoring pairs first
 * so no header or field is claimed twice — e.g. if two columns both look
 * like "first_name", only the closer match gets it and the other is left
 * for the person reviewing the mapping to resolve.
 */
function suggestMapping(rawHeaders: string[]): { columnMapping: Record<string, string>; scores: Record<string, SuggestedMatch> } {
  const candidates: { header: string; field: string; score: number }[] = []
  for (const header of rawHeaders) {
    for (const field of MAPPABLE_FIELDS) {
      let best = 0
      for (const alias of [field.label, ...field.aliases]) {
        best = Math.max(best, similarity(header, alias))
      }
      if (best >= MATCH_CONFIDENCE_THRESHOLD) candidates.push({ header, field: field.key, score: best })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const columnMapping: Record<string, string> = Object.fromEntries(rawHeaders.map(h => [h, '']))
  const scores: Record<string, SuggestedMatch> = Object.fromEntries(rawHeaders.map(h => [h, null]))
  const claimedFields = new Set<string>()

  for (const { header, field, score } of candidates) {
    if (columnMapping[header]) continue // header already claimed by a better match
    if (claimedFields.has(field)) continue // field already claimed by a better match
    columnMapping[header] = field
    scores[header] = { field, score }
    claimedFields.add(field)
  }

  return { columnMapping, scores }
}

/** Builds a field-key -> raw-header lookup from the (header -> field) mapping the user confirmed. */
function invertMapping(columnMapping: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [header, field] of Object.entries(columnMapping)) {
    if (field) out[field] = header
  }
  return out
}

function resolveRow(rawRow: RawRow, fieldToHeader: Record<string, string>): RawRow {
  const out: RawRow = {}
  for (const [field, header] of Object.entries(fieldToHeader)) {
    out[field] = rawRow[header]
  }
  return out
}

// ---------------------------------------------------------------------------
// Value parsing helpers
// ---------------------------------------------------------------------------

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

/** Parses raw CSV rows into student/guardian records using the confirmed column mapping. */
function parseRows(rawRows: RawRow[], fieldToHeader: Record<string, string>): ParsedRow[] {
  return rawRows.map((rawRow, i) => {
    const row = resolveRow(rawRow, fieldToHeader)
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
 * actually have a value. Now that column mapping is explicit and confirmed
 * up front, a field stuck at 0% here usually means the source data itself
 * is empty rather than a header-mapping mistake — but it's kept as a
 * second line of defense either way.
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
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [parsing, setParsing] = useState(false)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)

  // Upload + Map Columns state
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [suggestedScores, setSuggestedScores] = useState<Record<string, SuggestedMatch>>({})

  // Preview + Done state
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setParsing(true)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRawRows = results.data as RawRow[]
        const headers = results.meta.fields ?? []
        const { columnMapping: suggested, scores } = suggestMapping(headers)

        setRawRows(parsedRawRows)
        setRawHeaders(headers)
        setColumnMapping(suggested)
        setSuggestedScores(scores)
        setStep('map')
        setParsing(false)
      }
    })
  }

  // Sample value shown next to each column in the mapping table, to help
  // whoever's reviewing it recognize what the column actually contains.
  const sampleValues = useMemo(() => {
    const out: Record<string, string> = {}
    for (const header of rawHeaders) {
      const withValue = rawRows.find(r => cleanString(r[header]))
      out[header] = withValue ? withValue[header] : ''
    }
    return out
  }, [rawHeaders, rawRows])

  const mappingIssues = useMemo(() => {
    const issues: string[] = []
    const fieldCounts: Record<string, number> = {}
    for (const field of Object.values(columnMapping)) {
      if (field) fieldCounts[field] = (fieldCounts[field] ?? 0) + 1
    }
    for (const [field, count] of Object.entries(fieldCounts)) {
      if (count > 1) {
        const label = MAPPABLE_FIELDS.find(f => f.key === field)?.label ?? field
        issues.push(`"${label}" is mapped from more than one column — set the extra one(s) to "Don't import".`)
      }
    }
    for (const field of MAPPABLE_FIELDS.filter(f => f.required)) {
      if (!Object.values(columnMapping).includes(field.key)) {
        issues.push(`"${field.label}" must be mapped to a column before continuing.`)
      }
    }
    return issues
  }, [columnMapping])

  async function handleConfirmMapping() {
    if (mappingIssues.length > 0) return
    setCheckingDuplicates(true)

    const fieldToHeader = invertMapping(columnMapping)
    const parsedRows = parseRows(rawRows, fieldToHeader)

    // Check parsed rows against students already in the database so we can
    // flag duplicates before anything is imported.
    const { data: existing, error: fetchError } = await supabase
      .from('students')
      .select('personal_email, first_name, last_name, birthday')

    const withDuplicates = fetchError ? parsedRows : markDuplicates(parsedRows, existing ?? [])

    setRows(withDuplicates)
    setStep('preview')
    setCheckingDuplicates(false)
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
    setRawRows([])
    setRawHeaders([])
    setColumnMapping({})
    setSuggestedScores({})
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

  const selectStyle = {
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    fontSize: '13px',
    color: '#0a2240',
    backgroundColor: '#ffffff',
    outline: 'none',
    minWidth: '220px',
  }

  const steps = ['Upload', 'Map Columns', 'Preview', 'Done']
  const stepIndex = ['upload', 'map', 'preview', 'done'].indexOf(step)

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
          Import Students
        </h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>
          Upload your Google Forms CSV export to import students and guardians.
        </p>
      </div>

      {/* Steps indicator */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', alignItems: 'center' }}>
        {steps.map((s, i) => {
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
              {i < steps.length - 1 && <div style={{ width: '32px', height: '1px', backgroundColor: '#e5e7eb' }} />}
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
            {parsing ? 'Reading file…' : 'Upload your CSV file'}
          </div>
          <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '32px' }}>
            The next step will suggest how each column maps to a student field — no need to rename headers first.
          </div>
          <label style={{
            backgroundColor: parsing ? '#9ca3af' : '#ff5120', color: '#ffffff', padding: '12px 32px',
            borderRadius: '8px', fontSize: '14px', fontWeight: '600',
            cursor: parsing ? 'not-allowed' : 'pointer', display: 'inline-block',
          }}>
            Choose CSV File
            <input type="file" accept=".csv" onChange={handleFile} disabled={parsing} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* Map Columns step */}
      {step === 'map' && (
        <div>
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '24px',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 4px 0' }}>
                Confirm Column Mapping
              </h2>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                Each column has been matched to a field automatically — check the guesses and adjust anything that looks wrong.
              </p>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['CSV Column', 'Sample Value', 'Maps To', 'Match'].map(h => (
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
                  {rawHeaders.map((header, i) => {
                    const match = suggestedScores[header]
                    const currentField = columnMapping[header] ?? ''
                    const isSuggested = !!match && currentField === match.field
                    const badge = !currentField
                      ? { bg: '#f3f4f6', text: '#9ca3af', label: 'Not imported' }
                      : isSuggested && match!.score >= 0.85
                      ? { bg: '#f0fdf4', text: '#16a34a', label: 'Auto-matched' }
                      : isSuggested
                      ? { bg: '#fffbeb', text: '#b45309', label: 'Best guess — check' }
                      : { bg: '#eff6ff', text: '#5eb3e4', label: 'Manually set' }
                    return (
                      <tr key={header} style={{ borderBottom: i < rawHeaders.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#0a2240' }}>
                          {header}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sampleValues[header] || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <select
                            value={currentField}
                            onChange={e => setColumnMapping(prev => ({ ...prev, [header]: e.target.value }))}
                            style={selectStyle}
                          >
                            <option value="">— Don&apos;t import —</option>
                            {MAPPABLE_FIELDS.map(f => (
                              <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            backgroundColor: badge.bg, color: badge.text, fontSize: '11px', fontWeight: '600',
                            padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
                          }}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {mappingIssues.length > 0 && (
            <div style={{
              backgroundColor: '#fef2f2', color: '#dc2626', padding: '12px 16px',
              borderRadius: '8px', fontSize: '13px', marginBottom: '24px',
            }}>
              {mappingIssues.map(issue => <div key={issue}>{issue}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleConfirmMapping}
              disabled={mappingIssues.length > 0 || checkingDuplicates}
              style={{
                backgroundColor: (mappingIssues.length > 0 || checkingDuplicates) ? '#9ca3af' : '#ff5120',
                color: '#ffffff', padding: '12px 32px', borderRadius: '8px',
                border: 'none', fontSize: '14px', fontWeight: '600',
                cursor: (mappingIssues.length > 0 || checkingDuplicates) ? 'not-allowed' : 'pointer',
              }}
            >
              {checkingDuplicates ? 'Checking for duplicates…' : 'Continue to Preview'}
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

          {/* Field completeness — second line of defense after column mapping */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 4px 0' }}>
              Field Completeness
            </h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 16px 0' }}>
              A field stuck at 0% is worth a second look — either the source data is genuinely blank, or the wrong column got mapped to it.
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
              onClick={() => setStep('map')}
              style={{
                backgroundColor: '#f9fafb', color: '#6b7280', padding: '12px 24px',
                borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px',
                fontWeight: '600', cursor: 'pointer',
              }}
            >
              Back to Mapping
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
