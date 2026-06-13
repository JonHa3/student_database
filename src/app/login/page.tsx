import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: students } = await supabase
    .from('students')
    .select('first_name, last_name, student_code')

  return (
    <main>
      <h1>Student Dashboard</h1>
      <p>Welcome, {user.email}</p>
      {students?.map((student) => (
        <div key={student.student_code}>
          {student.student_code} — {student.first_name} {student.last_name}
        </div>
      ))}
    </main>
  )
}