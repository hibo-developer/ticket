import { Permission } from '@/core/rbac/permissions'
import type { ModuleManifest } from '@/core/modules/types'
import Reports from '@/modules/reports/pages/Reports'
import { ChartNoAxesCombined } from 'lucide-react'

export const reportsModule: ModuleManifest = {
  id: 'reports',
  name: 'Informes',
  version: '0.1.0',
  requiredPermissions: [Permission.ReportsRead],
  routes: [{ path: '/informes', Component: Reports, requiredPermissions: [Permission.ReportsRead] }],
  navItems: [{ label: 'Informes', path: '/informes', icon: ChartNoAxesCombined, requiredPermissions: [Permission.ReportsRead] }],
}
