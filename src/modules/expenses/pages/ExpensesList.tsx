import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { appendAudit } from '@/core/audit/audit'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { getExpenseStateInfo } from '@/core/expenses/expenseStatus'
import { compressImage } from '@/core/files/compressImage'
import { buildReceiptFilename } from '@/core/files/receiptFilename'
import { sha256HexBlob } from '@/core/files/sha256'
import { Permission } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { useViewLayout } from '@/core/views/useViewLayout'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export type ExpenseCategory =
  | 'desayuno'
  | 'almuerzo'
  | 'comida'
  | 'merienda'
  | 'cena'
  | 'combustible'
  | 'materiales'
  | 'otros'

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'desayuno', label: 'Desayuno' },
  { value: 'almuerzo', label: 'Almuerzo' },
  { value: 'comida', label: 'Comida' },
  { value: 'merienda', label: 'Merienda' },
  { value: 'cena', label: 'Cena' },
  { value: 'combustible', label: 'Combustible' },
  { value: 'materiales', label: 'Materiales' },
  { value: 'otros', label: 'Otros' },
]

export function getCategoryLabel(value: string | null | undefined) {
  const v = (value ?? '').toLowerCase()
  const found = EXPENSE_CATEGORIES.find((c) => c.value === v)
  return found ? found.label : value ?? '—'
}

type ExpenseRow = {
  id: string
  state: string
  expense_date: string | null
  total_amount: number | null
  currency: string | null
  category: string | null
  vehicle_plate: string | null
  employee_user_id: string | null
  has_receipt: boolean
}

type ExpenseForm = {
  category: ExpenseCategory | ''
  total_amount: string
  vehicle_plate: string
}

const STORAGE_BUCKET = 'tickets-cotepa'

function safeRandomId() {
  const c = globalThis.crypto as Crypto | undefined
  if (c && 'randomUUID' in c && typeof (c as any).randomUUID === 'function') return (c as any).randomUUID() as string
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizePlate(p: string) {
  return p.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export default function ExpensesList() {
  const { profile, session } = useAuth()
  const { permissions } = usePermissions()
  const { layout: formLayout } = useViewLayout('expenses.form')
  const { layout: listLayout } = useViewLayout('expenses.list')
  const navigate = useNavigate()

  const [form, setForm] = useState<ExpenseForm>({ category: '', total_amount: '', vehicle_plate: '' })
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const captureInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const pendingExpenseIdRef = useRef<string | null>(null)

  const canWrite = permissions.has(Permission.ExpensesWrite)
  const canApprove = permissions.has(Permission.ExpensesApprove)
  const canDeleteExpense = (r: ExpenseRow) => {
    if (!session?.user) return false
    return canApprove || r.employee_user_id === session.user.id
  }

  const deleteExpense = async (r: ExpenseRow) => {
    if (!canDeleteExpense(r)) return
    if (!profile?.org_id) return
    const confirmMsg =
      '¿Eliminar el gasto? Esta acción no se puede deshacer y se borrarán también sus adjuntos.'
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(confirmMsg)) return
    }

    setError(null)
    setSuccess(null)
    setUploadingFor(r.id)
    try {
      const { data: files } = await supabase
        .from('expense_files')
        .select('id, storage_bucket, storage_path')
        .eq('expense_id', r.id)
        .eq('org_id', profile.org_id)

      const paths = ((files ?? []) as any[]).map((f) => f.storage_path).filter(Boolean)
      if (paths.length > 0) {
        const firstBucket = ((files ?? []) as any[])[0]?.storage_bucket || STORAGE_BUCKET
        await supabase.storage.from(firstBucket).remove(paths)
      }

      const { error: delErr } = await supabase
        .from('expenses')
        .delete()
        .eq('id', r.id)
        .eq('org_id', profile.org_id)
      if (delErr) throw delErr

      await appendAudit({
        org_id: profile.org_id,
        action: 'EXPENSE_DELETE',
        resource_type: 'expense',
        resource_id: r.id,
        metadata: {
          category: r.category,
          total_amount: r.total_amount,
          vehicle_plate: r.vehicle_plate,
          had_receipt: r.has_receipt,
          receipt_count: paths.length,
        },
      })

      setSuccess('Gasto eliminado.')
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo eliminar el gasto.')
    } finally {
      setUploadingFor(null)
    }
  }

  const load = async () => {
    if (!profile?.org_id) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data: expData, error: expErr } = await supabase
      .from('expenses')
      .select('id, state, expense_date, total_amount, currency, category, vehicle_plate, employee_user_id')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (expErr) {
      setError(expErr.message)
      setRows([])
      setLoading(false)
      return
    }

    const ids = ((expData ?? []) as ExpenseRow[]).map((r) => r.id)
    let receiptMap: Record<string, boolean> = {}
    if (ids.length > 0) {
      const { data: files } = await supabase
        .from('expense_files')
        .select('expense_id')
        .eq('org_id', profile.org_id)
        .in('expense_id', ids)
      if (files) {
        receiptMap = Object.fromEntries(((files ?? []) as any[]).map((f) => [f.expense_id, true]))
      }
    }

    const enriched = ((expData ?? []) as ExpenseRow[]).map((r) => ({ ...r, has_receipt: Boolean(receiptMap[r.id]) }))

    setError(null)
    setRows(enriched)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [profile?.org_id])

  const validate = (): string | null => {
    if (!form.category) return 'Selecciona un tipo de gasto.'
    const parsed = form.total_amount.trim() ? Number(form.total_amount) : null
    if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return 'Introduce un importe válido.'
    if (form.category === 'combustible' && !normalizePlate(form.vehicle_plate)) {
      return 'Introduce la matrícula del vehículo para combustible.'
    }
    return null
  }

  const createExpense = async () => {
    if (!profile?.org_id || !session?.user) return

    const valErr = validate()
    if (valErr) {
      setError(valErr)
      return
    }

    const parsed = Number(form.total_amount)
    const plate = form.category === 'combustible' ? normalizePlate(form.vehicle_plate) : null

    setCreating(true)
    setError(null)
    setSuccess(null)

    const { data, error: insErr } = await supabase
      .from('expenses')
      .insert({
        org_id: profile.org_id,
        employee_user_id: session.user.id,
        state: 'draft',
        expense_date: new Date().toISOString().slice(0, 10),
        total_amount: parsed,
        currency: 'EUR',
        category: form.category,
        vehicle_plate: plate,
      })
      .select('id')
      .single()

    setCreating(false)

    if (insErr) {
      setError(insErr.message)
      return
    }

    const expenseId = (data as any)?.id as string

    await appendAudit({
      org_id: profile.org_id,
      action: 'EXPENSE_CREATE',
      resource_type: 'expense',
      resource_id: expenseId,
      metadata: { category: form.category, total_amount: parsed, vehicle_plate: plate },
    })

    setForm({ category: '', total_amount: '', vehicle_plate: '' })
    setSuccess('Gasto creado. Ahora puedes adjuntar la foto del ticket.')
    pendingExpenseIdRef.current = expenseId
    await load()
  }

  const openUploadForExpense = (expenseId: string) => {
    if (!canWrite) return
    pendingExpenseIdRef.current = expenseId
    uploadInputRef.current?.click()
  }

  const openCaptureForExpense = (expenseId: string) => {
    if (!canWrite) return
    pendingExpenseIdRef.current = expenseId
    captureInputRef.current?.click()
  }

  const handleFile = async (file: File) => {
    const expenseId = pendingExpenseIdRef.current
    if (!expenseId || !profile?.org_id || !session?.user) return
    if (!canWrite) return
    if (!file.type.startsWith('image/')) {
      setError('Solo se admiten imágenes para el ticket de caja.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('La imagen supera el límite de 15MB.')
      return
    }

    setUploadingFor(expenseId)
    setError(null)
    setSuccess(null)

    try {
      const compressed = await compressImage(file, {
        maxDimension: 1280,
        quality: 0.7,
        maxBytes: 300 * 1024,
        format: 'image/jpeg',
      })

      const categoryLabel = getCategoryLabel(form.category || null)
      const safeName = buildReceiptFilename({
        date: new Date().toISOString().slice(0, 10),
        concept: categoryLabel || 'gasto',
        originalName: file.name,
        mimeType: 'image/jpeg',
      })
      const objectPath = `org_${profile.org_id}/expenses/${expenseId}/${safeRandomId()}-${safeName}`
      const uploadBlob = compressed.blob

      const up = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, uploadBlob, {
        upsert: false,
        contentType: 'image/jpeg',
      })
      if (up.error) throw up.error

      const sha256 = await sha256HexBlob(uploadBlob)

      const ins = await supabase.from('expense_files').insert({
        org_id: profile.org_id,
        expense_id: expenseId,
        filename: safeName,
        mimetype: 'image/jpeg',
        byte_size: uploadBlob.size,
        storage_bucket: STORAGE_BUCKET,
        storage_path: objectPath,
        sha256,
      })
      if (ins.error) throw ins.error

      await appendAudit({
        org_id: profile.org_id,
        action: 'EXPENSE_RECEIPT_UPLOAD',
        resource_type: 'expense',
        resource_id: expenseId,
        metadata: {
          filename: safeName,
          sha256,
          byte_size: uploadBlob.size,
          original_size: compressed.originalSize,
          compressed_size: compressed.compressedSize,
          width: compressed.width,
          height: compressed.height,
        },
      })

      const ratio = compressed.originalSize > 0 ? Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100) : 0
      setSuccess(`Ticket adjuntado (${Math.round(uploadBlob.size / 1024)} KB, reducido ${ratio}%).`)
      pendingExpenseIdRef.current = null
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo adjuntar el ticket.')
    } finally {
      setUploadingFor(null)
    }
  }

  const visibleColumns = listLayout.fields.filter((f) => f.visible !== false)

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">Gastos</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Gastos</h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-900">Crear gasto</div>
            <div className="mt-1 text-sm text-zinc-600">
              Indica el tipo de gasto e importe. Después adjunta la foto del ticket de caja.
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
          {formLayout.fields
            .filter((f) => f.visible !== false)
            .map((f) => {
              if (f.key === 'category') {
                return (
                  <div key={f.key} className="md:col-span-4">
                    <label className="block">
                      <div className="text-xs font-medium text-zinc-700">{f.label}</div>
                      <select
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                        value={form.category}
                        onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as ExpenseCategory | '' }))}
                        disabled={!canWrite || creating}
                        required={f.required}
                      >
                        <option value="">Selecciona un tipo…</option>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )
              }
              if (f.key === 'total_amount') {
                return (
                  <div key={f.key} className="md:col-span-3">
                    <label className="block">
                      <div className="text-xs font-medium text-zinc-700">{f.label}</div>
                      <Input
                        className="mt-1"
                        placeholder={f.label}
                        inputMode="decimal"
                        value={form.total_amount}
                        onChange={(e) => setForm((p) => ({ ...p, total_amount: e.target.value }))}
                        disabled={!canWrite || creating}
                        required={f.required}
                      />
                    </label>
                  </div>
                )
              }
              if (f.key === 'vehicle_plate') {
                if (form.category !== 'combustible') return null
                return (
                  <div key={f.key} className="md:col-span-3">
                    <label className="block">
                      <div className="text-xs font-medium text-zinc-700">
                        {f.label} <span className="text-rose-600">*</span>
                      </div>
                      <Input
                        className="mt-1"
                        placeholder="Ej. 1234ABC"
                        value={form.vehicle_plate}
                        onChange={(e) => setForm((p) => ({ ...p, vehicle_plate: e.target.value }))}
                        disabled={!canWrite || creating}
                        required
                      />
                    </label>
                  </div>
                )
              }
              return null
            })}
          <div className="md:col-span-2 flex items-end">
            <Button type="button" className="w-full" onClick={createExpense} disabled={!canWrite || creating}>
              {creating ? 'Creando…' : 'Crear gasto'}
            </Button>
          </div>
        </div>

        <input
          ref={captureInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            e.currentTarget.value = ''
          }}
          disabled={!canWrite || creating || uploadingFor !== null}
        />
        <input
          ref={uploadInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            e.currentTarget.value = ''
          }}
          disabled={!canWrite || creating || uploadingFor !== null}
        />

        {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-700">{success}</div> : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4 text-sm font-medium text-zinc-900">Últimos gastos</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="[&>th]:px-5 [&>th]:py-3">
                {visibleColumns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th className="text-right">Ticket</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td className="px-5 py-4 text-zinc-500" colSpan={visibleColumns.length + 2}>
                    Cargando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-4 text-zinc-500" colSpan={visibleColumns.length + 2}>
                    Sin gastos todavía.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isUploading = uploadingFor === r.id
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50">
                      {visibleColumns.map((c) => {
                        if (c.key === 'expense_date') {
                          return (
                            <td key={c.key} className="px-5 py-4 text-zinc-700">
                              {r.expense_date ?? '—'}
                            </td>
                          )
                        }
                        if (c.key === 'category') {
                          return (
                            <td key={c.key} className="px-5 py-4">
                              <Link className="font-medium text-zinc-900 hover:underline" to={`/gastos/${r.id}`}>
                                {getCategoryLabel(r.category)}
                              </Link>
                            </td>
                          )
                        }
                        if (c.key === 'vehicle_plate') {
                          return (
                            <td key={c.key} className="px-5 py-4 font-mono text-xs text-zinc-700">
                              {r.vehicle_plate ?? '—'}
                            </td>
                          )
                        }
                        if (c.key === 'total_amount') {
                          return (
                            <td key={c.key} className="px-5 py-4 text-zinc-700">
                              {r.total_amount != null ? `${r.total_amount.toFixed(2)} ${r.currency ?? ''}` : '—'}
                            </td>
                          )
                        }
                        if (c.key === 'state') {
                          return (
                            <td key={c.key} className="px-5 py-4">
                              <span className={getExpenseStateInfo(r.state).badgeClassName}>
                                {getExpenseStateInfo(r.state).label}
                              </span>
                            </td>
                          )
                        }
                        return (
                          <td key={c.key} className="px-5 py-4 text-zinc-700">
                            —
                          </td>
                        )
                      })}
                      <td className="px-5 py-4 text-right">
                        {r.has_receipt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700 ring-1 ring-emerald-200">
                            Adjunto ✓
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700 ring-1 ring-amber-200">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/gastos/${r.id}`)}
                          >
                            Detalle
                          </Button>
                          {!r.has_receipt ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => openCaptureForExpense(r.id)}
                                disabled={!canWrite || isUploading || uploadingFor !== null}
                              >
                                {isUploading ? 'Subiendo…' : 'Capturar ticket'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => openUploadForExpense(r.id)}
                                disabled={!canWrite || isUploading || uploadingFor !== null}
                              >
                                Subir foto
                              </Button>
                            </>
                          ) : null}
                          {canDeleteExpense(r) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              onClick={() => void deleteExpense(r)}
                              disabled={uploadingFor !== null}
                            >
                              Eliminar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
