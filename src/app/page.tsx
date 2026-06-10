import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data, error } = await supabase
    .from('students')
    .select('first_name, last_name, student_code')

  if (error) {
    return <div>Error: {error.message}</div>
  }

  return (
    <main>
      <h1>Student Dashboard</h1>
      {data?.map((student) => (
        <div key={student.student_code}>
          {student.student_code} — {student.first_name} {student.last_name}
        </div>
      ))}
    </main>
  )
}