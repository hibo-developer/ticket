import type { ViewLayout } from '@/core/views/types'

export const defaultViews = {
  'tickets.list': {
    fields: [
      { key: 'title', label: 'Título', visible: true },
      { key: 'vendor', label: 'Proveedor', visible: true },
      { key: 'amount', label: 'Importe', visible: true },
      { key: 'status', label: 'Estado', visible: true },
    ],
  } satisfies ViewLayout,
  'tickets.form': {
    fields: [
      { key: 'title', label: 'Título', visible: true, required: true },
      { key: 'vendor', label: 'Proveedor', visible: true, required: false },
      { key: 'amount', label: 'Importe', visible: true, required: false },
    ],
  } satisfies ViewLayout,
  'expenses.list': {
    fields: [
      { key: 'expense_date', label: 'Fecha', visible: true },
      { key: 'category', label: 'Categoría', visible: true },
      { key: 'total_amount', label: 'Importe', visible: true },
      { key: 'state', label: 'Estado', visible: true },
    ],
  } satisfies ViewLayout,
  'expenses.form': {
    fields: [
      { key: 'category', label: 'Categoría', visible: true, required: false },
      { key: 'total_amount', label: 'Importe', visible: true, required: true },
    ],
  } satisfies ViewLayout,
} as const

export type DefaultViewKey = keyof typeof defaultViews
