/**
 * Supabase client for use in the browser (Client Components). Reads the
 * public URL + anon key, which are safe to expose — actual data access is
 * enforced server-side by the Row Level Security policies on each table.
 */
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}