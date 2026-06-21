import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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

  const { count: studentCount } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })

  const { count: activeCount } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#0a2240',
          margin: 0,
        }}>
          Dashboard
        </h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>
          Welcome back, {user.email}
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '32px'
      }}>
        {[
          { label: 'Total Students', value: studentCount ?? 0, color: '#0a2240' },
          { label: 'Active Students', value: activeCount ?? 0, color: '#ff5120' },
          { label: 'Programs', value: programs?.length ?? 0, color: '#5eb3e4' },
        ].map((stat) => (
          <div key={stat.label} style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            borderTop: `3px solid ${stat.color}`,
          }}>
            <div style={{
              fontSize: '32px',
              fontWeight: '800',
              color: stat.color,
              lineHeight: 1,
            }}>
              {stat.value}
            </div>
            <div style={{
              fontSize: '13px',
              color: '#6b7280',
              marginTop: '8px',
              fontWeight: '500',
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          fontSize: '16px',
          fontWeight: '700',
          color: '#0a2240',
          margin: '0 0 16px 0',
        }}>
          Programs
        </h2>

        {!programs || programs.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            No programs yet. Add your first program to get started.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {programs.map((program) => (
              <div key={program.id} style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                borderLeft: '4px solid #ff5120',
              }}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#0a2240',
                  marginBottom: '8px',
                }}>
                  {program.name}
                </div>
                {program.description && (
                  <div style={{
                    fontSize: '13px',
                    color: '#6b7280',
                    marginBottom: '16px',
                    lineHeight: 1.5,
                  }}>
                    {program.description}
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    {program.start_date && new Date(program.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    {program.end_date && ` — ${new Date(program.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                    {!program.end_date && program.start_date && ' — Ongoing'}
                  </div>
                  <div style={{
                    backgroundColor: '#f0f9ff',
                    color: '#5eb3e4',
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '4px 10px',
                    borderRadius: '20px',
                  }}>
                    {(program.student_programs as unknown as { count: number }[])?.[0]?.count ?? 0} students
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}