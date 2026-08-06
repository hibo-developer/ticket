import type { ModuleManifest } from '@/core/modules/types'
import { expensesModule } from '@/modules/expenses/manifest'
import { reportsModule } from '@/modules/reports/manifest'

export const allModules: ModuleManifest[] = [expensesModule, reportsModule]

export const allModuleIds = allModules.map((m) => m.id)
