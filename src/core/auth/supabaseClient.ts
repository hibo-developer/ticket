import { createClient } from '@supabase/supabase-js'

const isTest = import.meta.env.MODE === 'test'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!isTest && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('Faltan variables de entorno de Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
}

export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey) || isTest

export const supabase = createClient(supabaseUrl ?? 'http://localhost', supabaseAnonKey ?? 'test')
