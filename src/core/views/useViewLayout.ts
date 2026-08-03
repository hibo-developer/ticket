import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { defaultViews, type DefaultViewKey } from '@/core/views/defaults'
import { viewLayoutSchema } from '@/core/views/schema'
import type { ViewLayout } from '@/core/views/types'
import { useEffect, useMemo, useState } from 'react'

type State = {
  loading: boolean
  layout: ViewLayout
  source: 'default' | 'db'
}

export function useViewLayout(viewKey: DefaultViewKey): State {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [layout, setLayout] = useState<ViewLayout>(defaultViews[viewKey])
  const [source, setSource] = useState<State['source']>('default')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!profile?.org_id) {
        setLayout(defaultViews[viewKey])
        setSource('default')
        setLoading(false)
        return
      }

      setLoading(true)

      const { data, error } = await supabase
        .from('ui_views')
        .select('layout')
        .eq('org_id', profile.org_id)
        .eq('view_key', viewKey)
        .eq('active', true)
        .maybeSingle()

      if (cancelled) return

      if (error || !data?.layout) {
        setLayout(defaultViews[viewKey])
        setSource('default')
        setLoading(false)
        return
      }

      const parsed = viewLayoutSchema.safeParse(data.layout)
      if (!parsed.success) {
        setLayout(defaultViews[viewKey])
        setSource('default')
        setLoading(false)
        return
      }

      setLayout(parsed.data)
      setSource('db')
      setLoading(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [profile?.org_id, viewKey])

  return useMemo(() => ({ loading, layout, source }), [loading, layout, source])
}
