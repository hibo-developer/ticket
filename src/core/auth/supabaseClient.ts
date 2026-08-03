import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const isTest = import.meta.env.MODE === 'test'

export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey) || isTest

const url = supabaseUrl ?? 'http://localhost:54321'
const key = supabaseAnonKey ?? 'anon'

export const supabase = createClient(url, key)
