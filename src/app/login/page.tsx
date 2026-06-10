'use client'

import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const supabase = createClient()

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold">Student Dashboard</h1>
        <p className="text-gray-500">Sign in to access the database</p>
        <button
          onClick={handleGoogleLogin}S
          className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-gray-700 shadow-md hover:shadow-lg border border-gray-200 transition-all"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  )
}