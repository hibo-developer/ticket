import type { ViewLayout } from '@/core/views/types'

export const defaultViews = {
  'expenses.list': {
    fields: [
      { key: 'expense_date', label: 'Fecha', visible: true },
      { key: 'category', label: 'Tipo', visible: true },
      { key: 'vehicle_plate', label: 'Matrícula', visible: true },
      { key: 'total_amount', label: 'Importe', visible: true },
      { key: 'state', label: 'Estado', visible: true },
    ],
  } satisfies ViewLayout,
  'expenses.form': {
    fields: [
      { key: 'category', label: 'Tipo de gasto', visible: true, required: true },
      { key: 'total_amount', label: 'Importe', visible: true, required: true },
      { key: 'vehicle_plate', label: 'Matrícula vehículo', visible: true, required: false },
    ],
  } satisfies ViewLayout,
} as const

export type DefaultViewKey = keyof typeof defaultViews
