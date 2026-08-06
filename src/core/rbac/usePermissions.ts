import { supabase } from '@/core/auth/supabaseClient'
import { AllPermissions, type PermissionKey } from '@/core/rbac/permissions'
import { onPermissionsInvalidated } from '@/core/rbac/permissionsInvalidate'
import { useAuth } from '@/core/auth/AuthContext'
import { useEffect, useMemo, useState } from 'react'

type PermissionsState = {
  loading: boolean
  permissions: Set<PermissionKey>
}

export function usePermissions(): PermissionsState {
  const { profile, session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(new Set())
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    return onPermissionsInvalidated(() => setNonce((n) => n + 1))
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!session?.user || !profile?.active) {
        setPermissions(new Set())
        setLoading(false)
        return
      }

      if (profile.app_role === 'admin') {
        setPermissions(new Set(AllPermissions))
        setLoading(false)
        return
      }

      setLoading(true)

      const { data, error } = await supabase
        .from('user_roles')
        .select('role_id, roles!inner(id, role_permissions(permission_key))')
        .eq('user_id', session.user.id)

      if (cancelled) return

      if (error) {
        setPermissions(new Set())
        setLoading(false)
        return
      }

      const next = new Set<PermissionKey>()

      for (const row of data as any[]) {
        const role = row.roles
        const rolePerms = (role?.role_permissions ?? []) as { permission_key: string }[]
        for (const p of rolePerms) next.add(p.permission_key as PermissionKey)
      }

      setPermissions(next)
      setLoading(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id, profile?.app_role, profile?.active, nonce])

  return useMemo(() => ({ loading, permissions }), [loading, permissions])
}

export function can(permissions: Set<PermissionKey>, permission: PermissionKey) {
  return permissions.has(permission)
}
