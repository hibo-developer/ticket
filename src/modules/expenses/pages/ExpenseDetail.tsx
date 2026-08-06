import { Button } from '@/components/ui/Button'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { appendAudit } from '@/core/audit/audit'
import { compressImage } from '@/core/files/compressImage'
import { buildReceiptFilename } from '@/core/files/receiptFilename'
import { sha256HexBlob } from '@/core/files/sha256'
import { signDownloadUrl } from '@/core/storage/signedUrls'
import { Permission } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { EXPENSE_CATEGORIES, getCategoryLabel } from '@/modules/expenses/pages/ExpensesList'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

type Expense = {
  id: string
  state: string
  expense_date: string | null
  total_amount: number | null
  currency: string | null
  category: string | null
  vehicle_plate: string | null
  created_at: string
}

type ExpenseFile = {
  id: string
  expense_id: string
  filename: string
  mimetype: string | null
  byte_size: number | null
  storage_bucket: string
  storage_path: string
  sha256: string
  created_at: string
}

const STORAGE_BUCKET = 'tickets-cotepa'

function safeRandomId() {
  const c = globalThis.crypto as Crypto | undefined
  if (c && 'randomUUID' in c && typeof (c as any).randomUUID === 'function') return (c as any).randomUUID() as string
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function ExpenseDetail() {
  const { id } = useParams()
  const { profile, session } = useAuth()
  const { permissions } = usePermissions()

  const [expense, setExpense] = useState<Expense | null>(null)
  const [files, setFiles] = useState<ExpenseFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const captureInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const canWrite = permissions.has(Permission.ExpensesWrite)
  const canApprove = permissions.has(Permission.ExpensesApprove)
  const canRead = permissions.has(Permission.ExpensesRead)

  const load = async () => {
    if (!id || !profile?.org_id) {
      setExpense(null)
      setFiles([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [eRes, fRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, state, expense_date, total_amount, currency, category, vehicle_plate, created_at')
        .eq('id', id)
        .eq('org_id', profile.org_id)
        .single(),
      supabase
        .from('expense_files')
        .select('id, expense_id, filename, mimetype, byte_size, storage_bucket, storage_path, sha256, created_at')
        .eq('org_id', profile.org_id)
        .eq('expense_id', id)
        .order('created_at', { ascending: false }),
    ])

    if (eRes.error) {
      setError(eRes.error.message)
      setExpense(null)
      setFiles([])
      setLoading(false)
      return
    }

    setExpense(eRes.data as Expense)
    setFiles((fRes.data ?? []) as ExpenseFile[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id, profile?.org_id])

  const subtitle = useMemo(() => {
    if (!expense) return ''
    const parts = []
    if (expense.category) parts.push(getCategoryLabel(expense.category))
    if (expense.vehicle_plate) parts.push(`Matrícula ${expense.vehicle_plate}`)
    if (expense.total_amount != null) parts.push(`${expense.total_amount.toFixed(2)} ${expense.currency ?? ''}`.trim())
    if (expense.expense_date) parts.push(expense.expense_date)
    return parts.join(' · ')
  }, [expense])

  const handleFile = async (file: File) => {
    if (!id || !profile?.org_id || !session?.user) return
    if (!canWrite) return
    if (!file.type.startsWith('image/')) {
      setError('Solo se admiten imágenes para el ticket de caja.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('La imagen supera el límite de 15MB.')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const compressed = await compressImage(file, {
        maxDimension: 1280,
        quality: 0.7,
        maxBytes: 300 * 1024,
        format: 'image/jpeg',
      })

      const safeName = buildReceiptFilename({
        date: expense?.expense_date ?? new Date().toISOString().slice(0, 10),
        concept: getCategoryLabel(expense?.category) || 'gasto',
        originalName: file.name,
        mimeType: 'image/jpeg',
      })
      const objectPath = `org_${profile.org_id}/expenses/${id}/${safeRandomId()}-${safeName}`
      const uploadBlob = compressed.blob

      const up = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, uploadBlob, {
        upsert: false,
        contentType: 'image/jpeg',
      })
      if (up.error) throw up.error

      const sha256 = await sha256HexBlob(uploadBlob)

      const ins = await supabase.from('expense_files').insert({
        org_id: profile.org_id,
        expense_id: id,
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
        resource_id: id,
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
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo adjuntar el ticket.')
    } finally {
      setBusy(false)
    }
  }

  const download = async (f: ExpenseFile) => {
    if (!canRead) return
    if (!profile?.org_id) return

    setBusy(true)
    setError(null)

    try {
      const { signed_url } = await signDownloadUrl({
        bucket: f.storage_bucket,
        path: f.storage_path,
        resource_type: 'expense_file',
        resource_id: f.id,
      })

      await appendAudit({
        org_id: profile.org_id,
        action: 'EXPENSE_RECEIPT_DOWNLOAD',
        resource_type: 'expense',
        resource_id: id,
        metadata: { filename: f.filename, sha256: f.sha256 },
      })

      const a = document.createElement('a')
      a.href = signed_url
      a.download = f.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e: any) {
      setError(e?.message ?? 'Error al generar la descarga.')
    } finally {
      setBusy(false)
    }
  }

  const changeState = async (newState: 'approved' | 'rejected' | 'draft') => {
    if (!id || !expense || !profile?.org_id) return
    if (!canApprove) return
    setBusy(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('expenses')
        .update({ state: newState, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('org_id', profile.org_id)
      if (error) throw error

      await appendAudit({
        org_id: profile.org_id,
        action: 'EXPENSE_STATE_CHANGE',
        resource_type: 'expense',
        resource_id: id,
        metadata: { old_state: expense.state, new_state: newState },
      })

      setSuccess(`Estado actualizado a "${newState}".`)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo actualizar el estado.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">Cargando…</div>
  }

  if (!expense) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-900">No encontrado</div>
          <div className="mt-2 text-sm text-zinc-600">No se puede acceder a este gasto.</div>
          <div className="mt-4">
            <Link className="text-sm text-zinc-900 underline underline-offset-4" to="/gastos">
              Volver a gastos
            </Link>
          </div>
        </div>
        {error ? <div className="text-sm text-rose-600">{error}</div> : null}
      </div>
    )
  }

  const categoryLabel = getCategoryLabel(expense.category)

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link className="hover:underline" to="/gastos">
            Gastos
          </Link>{' '}
          / {expense.id.slice(0, 8)}
        </div>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{categoryLabel}</h1>
            {subtitle ? <div className="mt-1 text-sm text-zinc-600">{subtitle}</div> : null}
          </div>
          <div className="flex gap-2">
            {expense.state !== 'approved' && canApprove ? (
              <Button type="button" onClick={() => changeState('approved')} disabled={busy}>
                Aprobar
              </Button>
            ) : null}
            {expense.state !== 'rejected' && canApprove ? (
              <Button type="button" variant="danger" onClick={() => changeState('rejected')} disabled={busy}>
                Rechazar
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-zinc-900">Datos del gasto</div>
          <div>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
              Estado: {expense.state}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Tipo</div>
            <div className="mt-1 text-sm text-zinc-900">{categoryLabel}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Fecha</div>
            <div className="mt-1 text-sm text-zinc-900">{expense.expense_date ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Importe</div>
            <div className="mt-1 text-sm text-zinc-900">
              {expense.total_amount != null ? `${expense.total_amount.toFixed(2)} ${expense.currency ?? ''}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Matrícula vehículo</div>
            <div className="mt-1 font-mono text-sm text-zinc-900">{expense.vehicle_plate ?? '—'}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-900">Adjuntos — Ticket de caja</div>
            <div className="mt-1 text-sm text-zinc-600">
              Sube o captura la foto del ticket. Las imágenes se comprimen automáticamente para ahorrar espacio.
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <input
                ref={captureInputRef}
                aria-label="Capturar foto ticket"
                className="hidden"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                  e.currentTarget.value = ''
                }}
                disabled={!canWrite || busy}
              />
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={!canWrite || busy}
                onClick={() => captureInputRef.current?.click()}
              >
                {busy ? 'Procesando…' : 'Capturar foto'}
              </Button>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <input
                ref={uploadInputRef}
                aria-label="Subir ticket"
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                  e.currentTarget.value = ''
                }}
                disabled={!canWrite || busy}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={!canWrite || busy}
                onClick={() => uploadInputRef.current?.click()}
              >
                {busy ? 'Procesando…' : 'Subir archivo'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="[&>th]:px-3 [&>th]:py-2">
                <th>Archivo</th>
                <th>Tipo</th>
                <th>Tamaño</th>
                <th>Hash</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {files.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={5}>
                    Sin adjuntos. Sube la foto del ticket de caja para que administración pueda cotejarlo.
                  </td>
                </tr>
              ) : (
                files.map((f) => (
                  <tr key={f.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3 font-medium text-zinc-900">{f.filename}</td>
                    <td className="px-3 py-3 text-zinc-600">{f.mimetype ?? '—'}</td>
                    <td className="px-3 py-3 text-zinc-600">
                      {f.byte_size != null ? `${Math.max(1, Math.round(f.byte_size / 1024))} KB` : '—'}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-zinc-600">{f.sha256.slice(0, 16)}…</td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => download(f)}
                        disabled={busy || !canRead}
                      >
                        Descargar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
