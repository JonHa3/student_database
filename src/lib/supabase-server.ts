/**
 * Supabase clients for use on the server (Server Components, Route Handlers).
 */
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * The standard server-side client: reads the logged-in user's session from
 * cookies and is still subject to Row Level Security, same as the browser
 * client. Use this for anything done "as the current user."
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore
          }
        }
      }
    }
  )
}

/**
 * Admin client authenticated with the service role key, which bypasses Row
 * Level Security entirely. Only used where that's genuinely required (e.g.
 * listing all auth users for the Team page, which isn't exposed through the
 * regular `profiles` table) — never for routine data access. Must only ever
 * run on the server; the service role key is never sent to the browser.
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}