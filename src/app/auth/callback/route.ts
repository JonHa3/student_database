/**
 * Google OAuth redirects here after the user approves sign-in, with a
 * one-time `code` query param. We exchange it for a real Supabase session
 * (stored in cookies by the ssr client) and send the user on to the
 * dashboard, where `middleware.ts` will now see them as logged in.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL('/', requestUrl.origin))
}