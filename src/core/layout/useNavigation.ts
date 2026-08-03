import { allModuleIds, allModules } from '@/core/modules/registry'
import { useEnabledModules } from '@/core/modules/useEnabledModules'
import { Permission, type PermissionKey } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import type { NavItem } from '@/core/modules/types'
import { LayoutDashboard, Shield } from 'lucide-react'
import { useMemo } from 'react'

export function useNavigation() {
  const { loading: permsLoading, permissions } = usePermissions()
  const { loading: modulesLoading, enabled } = useEnabledModules(allModuleIds)

  const navItems = useMemo(() => {
    const canAll = (required?: PermissionKey[]) => {
      if (!required || required.length === 0) return true
      for (const r of required) if (!permissions.has(r)) return false
      return true
    }

    const items: NavItem[] = [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Admin', path: '/admin', icon: Shield, requiredPermissions: [Permission.AdminAccess] },
    ].filter((i) => canAll(i.requiredPermissions))

    const moduleItems = allModules
      .filter((m) => enabled.has(m.id))
      .flatMap((m) => m.navItems)
      .filter((i) => canAll(i.requiredPermissions))

    return [...items, ...moduleItems]
  }, [permissions, enabled])

  return { loading: permsLoading || modulesLoading, navItems }
}
