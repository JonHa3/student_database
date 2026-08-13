'use client'

/**
 * Sign-in page — the only route reachable without a session (see
 * middleware.ts). Google OAuth is handled entirely by Supabase Auth; this
 * just kicks off the redirect and lands back at /auth/callback.
 */
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const supabase = createClient()

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Built from the current origin rather than hardcoded, so Google
        // sign-in also works from `npm run dev` on localhost and from
        // Vercel preview deployments, not just the production domain.
        redirectTo: `${window.location.origin}/auth/callback`,
      }
    })
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold" style={{ color: '#0a2240' }}>
          Do Greater Charlotte
        </h1>
        <p style={{ color: '#6b7280' }}>Sign in to access the student dashboard</p>
        <button
          onClick={handleGoogleLogin}
          className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-gray-700 shadow-md hover:shadow-lg border border-gray-200 transition-all"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  )
}