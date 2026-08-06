export const Permission = {
  AdminAccess: 'admin.access',
  AuditRead: 'audit.read',
  ModulesManage: 'modules.manage',
  ViewsManage: 'views.manage',
  RolesManage: 'roles.manage',
  ExpensesRead: 'expenses.read',
  ExpensesWrite: 'expenses.write',
  ExpensesApprove: 'expenses.approve',
  ReportsRead: 'reports.read',
} as const

export type PermissionKey = (typeof Permission)[keyof typeof Permission]

export const AllPermissions: PermissionKey[] = Object.values(Permission)
