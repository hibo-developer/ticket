import type { LucideIcon } from 'lucide-react'
import type { PermissionKey } from '@/core/rbac/permissions'
import type { ComponentType } from 'react'

export type AppRoute = {
  path: string
  Component: ComponentType
  requiredPermissions?: PermissionKey[]
}

export type NavItem = {
  label: string
  path: string
  icon: LucideIcon
  requiredPermissions?: PermissionKey[]
}

export type ModuleManifest = {
  id: string
  name: string
  version: string
  requiredPermissions: PermissionKey[]
  routes: AppRoute[]
  navItems: NavItem[]
}
