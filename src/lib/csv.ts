/**
 * Small shared helper for triggering a client-side CSV download. Used by
 * both the import preview (downloading skipped rows) and the students list
 * (exporting the roster), so the download behavior stays consistent in one
 * place instead of being copy-pasted per page.
 */
import Papa from 'papaparse'

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
