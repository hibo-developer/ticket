import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://guesvujkcaftqnhojzyr.supabase.co'
const fallbackAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1ZXN2dWprY2FmdHFuaG9qenlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTkwMDksImV4cCI6MjEwMTA3NTAwOX0.F-rZR3s10W07K7vZtuzpRrNkA2chrOiaVDllyOP97zU'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? fallbackUrl
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? fallbackAnonKey

const isTest = import.meta.env.MODE === 'test'

export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey) || isTest

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
