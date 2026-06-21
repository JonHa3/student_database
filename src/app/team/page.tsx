import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import TeamClient from './teamclient'

export default async function TeamPage() {
  const supabase = await createServerSupabaseClient()
  const adminClient = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  const { data: members } = await supabase
    .from('profiles')
    .select('id, role, created_at')
    .order('created_at', { ascending: true })

  const { data: { users } } = await adminClient.auth.admin.listUsers()

  const teamMembers = (members ?? []).map(member => {
    const authUser = users?.find(u => u.id === member.id)
    const meta = authUser?.user_metadata ?? {}
    return {
      id: member.id,
      role: member.role,
      created_at: member.created_at,
      email: authUser?.email ?? 'Unknown',
      name: meta.full_name ?? meta.name ?? null,
      avatar: meta.avatar_url ?? meta.picture ?? null,
    }
  })

  return <TeamClient members={teamMembers} currentUserId={user.id} />
}