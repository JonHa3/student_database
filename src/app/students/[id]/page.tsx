import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import StudentAttachments from '@/components/studentattachments'

export default async function StudentProfilePage({
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

  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single()

  if (!student) redirect('/students')

  const { data: guardians } = await supabase
    .from('student_guardians')
    .select(`
      guardians (
        id,
        first_name,
        last_name,
        phone_number,
        email,
        relationship
      )
    `)
    .eq('student_id', id)

  const { data: programs } = await supabase
    .from('student_programs')
    .select(`
      id,
      enrollment_date,
      exit_date,
      notes,
      programs (
        id,
        name,
        start_date,
        end_date
      )
    `)
    .eq('student_id', id)
    .order('enrollment_date', { ascending: false })

  const isAdmin = profile?.role === 'admin'
  const activePrograms = programs?.filter(p => !p.exit_date) ?? []
  const pastPrograms = programs?.filter(p => p.exit_date) ?? []

  const infoSection = (label: string, value: string | null | undefined) => (
    <div key={label}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '14px', color: value ? '#0a2240' : '#d1d5db' }}>
        {value ?? '—'}
      </div>
    </div>
  )

  return (
    <div>
      {/* Back link */}
      <Link href="/students" style={{
        color: '#6b7280',
        fontSize: '13px',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginBottom: '12px',
      }}>
        ← Back to Students
      </Link>

      {/* Student header */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        borderLeft: '4px solid #ff5120',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0a2240', margin: 0 }}>
              {student.first_name} {student.last_name}
            </h1>
            <span style={{
              backgroundColor: student.status === 'active' ? '#f0fdf4' : '#f9fafb',
              color: student.status === 'active' ? '#16a34a' : '#9ca3af',
              fontSize: '11px',
              fontWeight: '600',
              padding: '3px 10px',
              borderRadius: '20px',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.5px',
            }}>
              {student.status ?? 'unknown'}
            </span>
          </div>
          <div style={{ fontSize: '14px', color: '#5eb3e4', fontWeight: '600' }}>
            {student.student_code}
          </div>
        </div>
        {isAdmin && (
          <Link href={`/students/${id}/edit`} style={{
            backgroundColor: '#f9fafb',
            color: '#0a2240',
            padding: '8px 16px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: '600',
            border: '1px solid #e5e7eb',
          }}>
            Edit Student
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

        {/* Personal Info */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
            Personal Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {infoSection('Birthday', student.birthday ? new Date(student.birthday + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null)}
            {infoSection('Gender', student.gender)}
            {infoSection('Pronouns', student.pronouns)}
            {infoSection('Race / Ethnicity', student.race_ethnicity)}
            {infoSection('Primary Language', student.primary_language)}
            {infoSection('T-Shirt Size', student.shirt_size)}
          </div>
        </div>

        {/* Contact Info */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
            Contact Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {infoSection('Personal Email', student.personal_email)}
            {infoSection('Phone', student.phone_number)}
            {infoSection('Street Address', student.street_address)}
            {infoSection('City', student.city)}
            {infoSection('Zip Code', student.zip_code)}
          </div>
        </div>

        {/* Academic Info */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
            Academic Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {infoSection('School', student.school)}
            {infoSection('Grade Level', student.grade_level)}
            {infoSection('Graduation Year', student.grad_year?.toString())}
            {infoSection('IEP / 504', student.IEP_504)}
          </div>
        </div>

        {/* Additional Info */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
            Additional Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {infoSection('Free / Reduced Lunch', student.free_reduced_lunch ? 'Yes' : 'No')}
            {infoSection('Dietary Restrictions', student.dietary_restrictions)}
            {infoSection('IEP / 504 Details', student.iep_504_details)}
            {infoSection('Emergency Contact', student.emergency_contact_name)}
            {infoSection('Emergency Phone', student.emergency_contact_phone)}
          </div>
        </div>
      </div>

      {/* Attachments */}
      <StudentAttachments studentId={id} />

      {/* Guardians */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: '24px',
      }}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
          Guardians
        </h2>
        {!guardians || guardians.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '14px' }}>No guardians on file.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
            {guardians.map((g, i) => {
              const guardian = g.guardians as unknown as {
                id: string, first_name: string, last_name: string,
                phone_number: string, email: string, relationship: string
              }
              return (
                <div key={i} style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid #e5e7eb',
                }}>
                  <div style={{ fontWeight: '700', color: '#0a2240', marginBottom: '4px' }}>
                    {guardian.first_name} {guardian.last_name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#5eb3e4', fontWeight: '600', marginBottom: '12px' }}>
                    {guardian.relationship ?? 'Guardian'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
                    {infoSection('Phone', guardian.phone_number)}
                    {infoSection('Email', guardian.email)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Programs */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0a2240', margin: '0 0 20px 0' }}>
          Program History
        </h2>
        {!programs || programs.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '14px' }}>No program history.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
            {[...activePrograms, ...pastPrograms].map((enrollment) => {
              const program = enrollment.programs as unknown as {
                id: string, name: string, start_date: string, end_date: string
              }
              const isActive = !enrollment.exit_date
              return (
                <div key={enrollment.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                }}>
                  <div>
                    <Link href={`/programs/${program.id}`} style={{
                      fontWeight: '600',
                      color: '#0a2240',
                      fontSize: '14px',
                      textDecoration: 'none',
                    }}>
                      {program.name}
                    </Link>
                    {enrollment.notes && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {enrollment.notes}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {enrollment.enrollment_date && new Date(enrollment.enrollment_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      {enrollment.exit_date && ` — ${new Date(enrollment.exit_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                      {!enrollment.exit_date && ' — Present'}
                    </div>
                    <span style={{
                      backgroundColor: isActive ? '#f0fdf4' : '#f9fafb',
                      color: isActive ? '#16a34a' : '#9ca3af',
                      fontSize: '11px',
                      fontWeight: '600',
                      padding: '2px 8px',
                      borderRadius: '20px',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.5px',
                      border: '1px solid',
                      borderColor: isActive ? '#bbf7d0' : '#e5e7eb',
                    }}>
                      {isActive ? 'Active' : 'Completed'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}