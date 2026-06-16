import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function ProgramsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: programs } = await supabase
    .from('programs')
    .select(`
      id,
      name,
      description,
      start_date,
      end_date,
      student_programs (count)
    `)
    .order('start_date', { ascending: false })

  const isAdmin = profile?.role === 'admin'

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
          <h1 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#0a2240',
            margin: 0,
          }}>
            Programs
          </h1>
          <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>
            {programs?.length ?? 0} total programs
          </p>
        </div>
        {isAdmin && (
          <Link href="/programs/new" style={{
            backgroundColor: '#ff5120',
            color: '#ffffff',
            padding: '10px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '600',
          }}>
            + Add Program
          </Link>
        )}
      </div>

      {/* Programs list */}
      {!programs || programs.length === 0 ? (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '64px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
          <div style={{ color: '#0a2240', fontWeight: '600', marginBottom: '8px' }}>
            No programs yet
          </div>
          <div style={{ color: '#9ca3af', fontSize: '14px' }}>
            {isAdmin ? 'Click "Add Program" to create your first program.' : 'No programs have been created yet.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {programs.map((program) => {
            const studentCount = (program.student_programs as unknown as { count: number }[])?.[0]?.count ?? 0
            const isOngoing = !program.end_date
            const isActive = isOngoing || (program.end_date && new Date(program.end_date) >= new Date())

            return (
              <Link
                key={program.id}
                href={`/programs/${program.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: '24px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  borderLeft: '4px solid #ff5120',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s ease',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '6px'
                    }}>
                      <span style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#0a2240',
                      }}>
                        {program.name}
                      </span>
                      <span style={{
                        backgroundColor: isActive ? '#f0fdf4' : '#f9fafb',
                        color: isActive ? '#16a34a' : '#9ca3af',
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '2px 8px',
                        borderRadius: '20px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        {isActive ? 'Active' : 'Ended'}
                      </span>
                    </div>
                    {program.description && (
                      <div style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        marginBottom: '8px',
                      }}>
                        {program.description}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {program.start_date && new Date(program.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {program.end_date && ` — ${new Date(program.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      {!program.end_date && program.start_date && ' — Ongoing'}
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                    marginLeft: '24px',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: '24px',
                        fontWeight: '800',
                        color: '#5eb3e4',
                        lineHeight: 1,
                      }}>
                        {studentCount}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginTop: '4px',
                      }}>
                        students
                      </div>
                    </div>
                    <div style={{ color: '#d1d5db', fontSize: '20px' }}>›</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}