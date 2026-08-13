'use client'

/**
 * Attachments section for a student profile — lets staff upload and browse
 * reference images (photos, permission slips, etc.) for that student.
 *
 * Files live in a private Supabase Storage bucket ("student-attachments"),
 * organized as `<studentId>/<timestamp>-<filename>`. The bucket is private
 * (not public) since these may be photos of minors, so every image is shown
 * through a short-lived signed URL rather than a permanent public link.
 *
 * Requires the one-time `supabase/setup_attachments.sql` script to have been
 * run against the project (creates the bucket + access policies) — see the
 * README for details. If it hasn't been run yet, uploads/loads will fail
 * with a clear error instead of silently doing nothing.
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const BUCKET = 'student-attachments'
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour, long enough for a browsing session

type Attachment = {
  name: string
  path: string
  url: string
  sizeBytes: number
  uploadedAt: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function StudentAttachments({ studentId }: { studentId: string }) {
  const supabase = createClient()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(studentId, { sortBy: { column: 'created_at', order: 'desc' } })

    if (listError) {
      // Most common cause: the setup SQL hasn't been run yet, so the bucket
      // doesn't exist.
      setError(`Couldn't load attachments (${listError.message}). Has supabase/setup_attachments.sql been run for this project?`)
      setLoading(false)
      return
    }

    const withUrls = await Promise.all(
      (files ?? []).map(async (file) => {
        const path = `${studentId}/${file.name}`
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
        return {
          name: file.name,
          path,
          url: signed?.signedUrl ?? '',
          sizeBytes: file.metadata?.size ?? 0,
          uploadedAt: file.created_at ?? '',
        }
      })
    )

    setAttachments(withUrls.filter(f => f.url))
    setLoading(false)
  }, [studentId, supabase])

  useEffect(() => { load() }, [load])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setError(null)

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`"${file.name}" isn't a supported image type (jpg, png, webp, heic).`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" is over the 10MB limit.`)
        continue
      }

      setUploading(true)
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${studentId}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
      if (uploadError) {
        setError(`Upload failed for "${file.name}": ${uploadError.message}`)
      }
    }

    setUploading(false)
    e.target.value = ''
    await load()
  }

  async function handleDelete(path: string) {
    if (!confirm('Remove this attachment? This cannot be undone.')) return
    const { error: deleteError } = await supabase.storage.from(BUCKET).remove([path])
    if (deleteError) {
      setError(`Couldn't remove attachment: ${deleteError.message}`)
      return
    }
    setAttachments(prev => prev.filter(a => a.path !== path))
  }

  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
          Attachments
        </h2>
        <label style={{
          backgroundColor: uploading ? '#9ca3af' : '#f9fafb',
          color: '#0a2240',
          padding: '8px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: '600',
          border: '1px solid #e5e7eb',
          cursor: uploading ? 'not-allowed' : 'pointer',
        }}>
          {uploading ? 'Uploading…' : '+ Add Image'}
          <input
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            multiple
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fef2f2', color: '#dc2626', padding: '10px 14px',
          borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: '14px' }}>Loading attachments…</div>
      ) : attachments.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: '14px' }}>No images attached yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
          {attachments.map(a => (
            <div key={a.path} style={{
              border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', position: 'relative',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, signed URLs can't go through next/image's remote optimizer without extra config */}
              <img
                src={a.url}
                alt={a.name}
                onClick={() => setLightboxUrl(a.url)}
                style={{ width: '100%', height: '110px', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }}
              />
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>{formatBytes(a.sizeBytes)}</div>
              </div>
              <button
                onClick={() => handleDelete(a.path)}
                title="Remove attachment"
                style={{
                  position: 'absolute', top: '6px', right: '6px',
                  backgroundColor: 'rgba(255,255,255,0.9)', color: '#dc2626',
                  border: 'none', borderRadius: '50%', width: '24px', height: '24px',
                  fontSize: '14px', fontWeight: '700', cursor: 'pointer', lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(10,34,64,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out', zIndex: 1000, padding: '40px',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Attachment preview" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  )
}
