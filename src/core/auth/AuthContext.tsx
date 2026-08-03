import { supabase, supabaseReady } from '@/core/auth/supabaseClient'
import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Profile = {
  id: string
  org_id: string
  full_name: string | null
  app_role: string
  active: boolean
}

type AuthState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      if (!supabaseReady) {
        if (cancelled) return
        setSession(null)
        setLoading(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(data.session ?? null)
      setLoading(false)
    }

    bootstrap()

    if (!supabaseReady) return () => {}

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      if (!supabaseReady) {
        setProfile(null)
        return
      }
      if (!session?.user) {
        setProfile(null)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, org_id, full_name, app_role, active')
        .eq('id', session.user.id)
        .single()

      if (cancelled) return

      if (error) {
        setProfile(null)
        return
      }

      setProfile(data as Profile)
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, profile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
