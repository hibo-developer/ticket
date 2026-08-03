import { usePermissions } from '@/core/rbac/usePermissions'
import type { PermissionKey } from '@/core/rbac/permissions'

export function RequirePermissions({
  required,
  children,
}: {
  required?: PermissionKey[]
  children: React.ReactNode
}) {
  const { loading, permissions } = usePermissions()

  if (loading) return null
  if (!required || required.length === 0) return <>{children}</>

  for (const key of required) {
    if (!permissions.has(key)) return null
  }

  return <>{children}</>
}
