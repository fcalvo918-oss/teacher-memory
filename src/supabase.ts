import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
// Only the browser's publishable key belongs in Vite environment variables.
// Authorization is enforced by the database's Row Level Security policies.
export const cloudConfigured = Boolean(url && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && key?.startsWith('sb_publishable_'))
export const supabase = cloudConfigured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export function authRedirect() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}
