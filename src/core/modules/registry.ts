import type { ModuleManifest } from '@/core/modules/types'
import { expensesModule } from '@/modules/expenses/manifest'
import { reportsModule } from '@/modules/reports/manifest'
import { ticketsModule } from '@/modules/tickets/manifest'

export const allModules: ModuleManifest[] = [ticketsModule, expensesModule, reportsModule]

export const allModuleIds = allModules.map((m) => m.id)
