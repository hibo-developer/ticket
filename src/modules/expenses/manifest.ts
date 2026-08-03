import { Permission } from '@/core/rbac/permissions'
import type { ModuleManifest } from '@/core/modules/types'
import ExpenseDetail from '@/modules/expenses/pages/ExpenseDetail'
import ExpensesList from '@/modules/expenses/pages/ExpensesList'
import { Wallet } from 'lucide-react'

export const expensesModule: ModuleManifest = {
  id: 'expenses',
  name: 'Gastos',
  version: '0.1.0',
  requiredPermissions: [Permission.ExpensesRead, Permission.ExpensesWrite, Permission.ExpensesApprove],
  routes: [
    { path: '/gastos', Component: ExpensesList, requiredPermissions: [Permission.ExpensesRead] },
    { path: '/gastos/:id', Component: ExpenseDetail, requiredPermissions: [Permission.ExpensesRead] },
  ],
  navItems: [
    { label: 'Gastos', path: '/gastos', icon: Wallet, requiredPermissions: [Permission.ExpensesRead] },
  ],
}
