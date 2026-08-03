import { supabase } from '@/core/auth/supabaseClient'
import { useAuth } from '@/core/auth/AuthContext'
import { useEffect, useMemo, useState } from 'react'

type EnabledModulesState = {
  loading: boolean
  enabled: Set<string>
}

export function useEnabledModules(availableModuleIds: string[]): EnabledModulesState {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!profile?.org_id) {
        setEnabled(new Set())
        setLoading(false)
        return
      }

      setLoading(true)

      const { data, error } = await supabase
        .from('module_toggles')
        .select('module_id, enabled')
        .eq('org_id', profile.org_id)
        .in('module_id', availableModuleIds)

      if (cancelled) return

      if (error) {
        setEnabled(new Set(availableModuleIds))
        setLoading(false)
        return
      }

      const rows = (data ?? []) as any[]
      const next = new Set<string>()

      for (const row of rows) {
        if (row.enabled) next.add(row.module_id as string)
      }

      if (rows.length === 0) for (const id of availableModuleIds) next.add(id)

      setEnabled(next)
      setLoading(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [profile?.org_id, availableModuleIds.join('|')])

  return useMemo(() => ({ loading, enabled }), [loading, enabled])
}
