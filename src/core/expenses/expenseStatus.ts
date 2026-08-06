export type ExpenseState = 'draft' | 'pending' | 'approved' | 'rejected'

export const EXPENSE_STATE_META: Record<
  ExpenseState,
  { label: string; tone: 'zinc' | 'amber' | 'emerald' | 'rose' }
> = {
  draft: { label: 'Borrador', tone: 'zinc' },
  pending: { label: 'Pendiente', tone: 'amber' },
  approved: { label: 'Aprobado', tone: 'emerald' },
  rejected: { label: 'Rechazado', tone: 'rose' },
}

const TONE_CLASS: Record<NonNullable<(typeof EXPENSE_STATE_META)[ExpenseState]['tone']>, string> = {
  zinc: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
}

export function getExpenseStateInfo(state: string | null | undefined) {
  const key = ((state ?? '').toLowerCase() as ExpenseState) || 'draft'
  const info = EXPENSE_STATE_META[key] ?? EXPENSE_STATE_META.draft
  return {
    state: key,
    label: info.label,
    tone: info.tone,
    badgeClassName: `inline-flex items-center rounded-full border px-2.5 py-1 text-xs ring-1 ${TONE_CLASS[info.tone]} ring-${info.tone}-200`,
  }
}
