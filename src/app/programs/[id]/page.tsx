import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('*')
    .eq('id', id)
    .single()

  if (!program) redirect('/programs')

  const { data: enrollments } = await supabase
    .from('student_programs')
    .select(`
      id,
      enrollment_date,
      exit_date,
      notes,
      students (
        id,
        first_name,
        last_name,
        student_code,
        school,
        grade_level
      )
    `)
    .eq('program_id', id)
    .order('enrollment_date', { ascending: false })

  const isAdmin = profile?.role === 'admin'
  const isActive = !program.end_date || new Date(program.end_date) >= new Date()
  const activeEnrollments = enrollments?.filter(e => !e.exit_date) ?? []
  const pastEnrollments = enrollments?.filter(e => e.exit_date) ?? []

  return (
    <div>
      {/* Back link */}
      <Link href="/programs" style={{
        color: '#6b7280',
        fontSize: '13px',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginBottom: '12px',
      }}>
        ← Back to Programs
      </Link>

      {/* Program header */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        borderLeft: '4px solid #ff5120',
        marginBottom: '24px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{
                fontSize: '24px',
                fontWeight: '700',
                color: '#0a2240',
                margin: 0,
              }}>
                {program.name}
              </h1>
              <span style={{
                backgroundColor: isActive ? '#f0fdf4' : '#f9fafb',
                color: isActive ? '#16a34a' : '#9ca3af',
                fontSize: '11px',
                fontWeight: '600',
                padding: '3px 10px',
                borderRadius: '20px',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.5px',
              }}>
                {isActive ? 'Active' : 'Ended'}
              </span>
            </div>

            {program.description && (
              <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 16px 0', lineHeight: 1.6 }}>
                {program.description}
              </p>
            )}

            <div style={{ fontSize: '13px', color: '#9ca3af' }}>
              {program.start_date && new Date(program.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {program.end_date && ` — ${new Date(program.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
              {!program.end_date && ' — Ongoing'}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '24px', marginLeft: '32px' }}>
            {[
              { label: 'Active', value: activeEnrollments.length, color: '#ff5120' },
              { label: 'Total', value: enrollments?.length ?? 0, color: '#5eb3e4' },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: '800', color: stat.color, lineHeight: 1 }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active students */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0a2240', margin: 0 }}>
            Active Students ({activeEnrollments.length})
          </h2>
          {isAdmin && (
            <Link href={`/programs/${id}/enroll`} style={{
              backgroundColor: '#ff5120',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: '600',
            }}>
              + Enroll Student
            </Link>
          )}
        </div>

        {activeEnrollments.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            color: '#9ca3af',
            fontSize: '14px',
          }}>
            No active students enrolled in this program.
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
                  {['Student', 'Code', 'School', 'Grade', 'Enrolled', 'Notes'].map((h) => (
                    <th key={h} style={{
                      padding: '12px 16px',
                      textAlign: 'left' as const,
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.5px',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeEnrollments.map((enrollment, i) => {
                  const student = enrollment.students as unknown as {
                    id: string, first_name: string, last_name: string,
                    student_code: string, school: string, grade_level: string
                  }
                  return (
                    <tr key={enrollment.id} style={{
                      borderBottom: i < activeEnrollments.length - 1 ? '1px solid #f3f4f6' : 'none',
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
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                        {enrollment.enrollment_date
                          ? new Date(enrollment.enrollment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                        {enrollment.notes ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past students */}
      {pastEnrollments.length > 0 && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0a2240', marginBottom: '16px' }}>
            Past Students ({pastEnrollments.length})
          </h2>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            opacity: 0.75,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Student', 'Code', 'Enrolled', 'Exited', 'Notes'].map((h) => (
                    <th key={h} style={{
                      padding: '12px 16px',
                      textAlign: 'left' as const,
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.5px',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastEnrollments.map((enrollment, i) => {
                  const student = enrollment.students as unknown as {
                    id: string, first_name: string, last_name: string, student_code: string
                  }
                  return (
                    <tr key={enrollment.id} style={{
                      borderBottom: i < pastEnrollments.length - 1 ? '1px solid #f3f4f6' : 'none',
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
                        {enrollment.enrollment_date
                          ? new Date(enrollment.enrollment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                        {enrollment.exit_date
                          ? new Date(enrollment.exit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>
                        {enrollment.notes ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}