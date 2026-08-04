import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { appendAudit } from '@/core/audit/audit'
import { downloadBlob } from '@/core/files/download'
import { buildReceiptFilename } from '@/core/files/receiptFilename'
import { sha256HexFile } from '@/core/files/sha256'
import { createZipBlob } from '@/core/files/zip'
import { runReceiptOcr } from '@/core/ocr/receiptOcr'
import { usePermissions } from '@/core/rbac/usePermissions'
import { Permission } from '@/core/rbac/permissions'
import { signDownloadUrl } from '@/core/storage/signedUrls'
import { softDeleteTicket } from '@/core/tickets/ticketsCrud'
import { getTicketStatusLabel } from '@/core/tickets/statusLabel'
import { useViewLayout } from '@/core/views/useViewLayout'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type TicketRow = {
  id: string
  title: string
  status: string
  ticket_date: string | null
  amount: number | null
  currency: string | null
  vendor: string | null
  created_at: string
  deleted_at: string | null
}

type TicketFileRow = {
  id: string
  ticket_id: string
  filename: string
  mimetype: string | null
  byte_size: number | null
  storage_bucket: string
  storage_path: string
  sha256: string
}

const MAX_BYTES = 15 * 1024 * 1024
const PAGE_SIZE = 50

function isAllowedType(file: File) {
  if (file.type === 'application/pdf') return true
  if (file.type.startsWith('image/')) return true
  if (file.type === 'text/xml') return true
  if (file.type === 'application/xml') return true
  return false
}

function safeRandomId() {
  const c = globalThis.crypto as Crypto | undefined
  if (c && 'randomUUID' in c && typeof (c as any).randomUUID === 'function') return (c as any).randomUUID() as string
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function TicketsList() {
  const { profile, session } = useAuth()
  const { permissions } = usePermissions()
  const { layout: formLayout } = useViewLayout('tickets.form')
  const { layout: listLayout } = useViewLayout('tickets.list')
  const navigate = useNavigate()

  const [form, setForm] = useState({ title: '', vendor: '', amount: '' })
  const [rows, setRows] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [creating, setCreating] = useState(false)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const canWrite = permissions.has(Permission.TicketsWrite)
  const canDownload = permissions.has(Permission.TicketsDownload)
  const captureInputRef = useRef<HTMLInputElement>(null)

  const load = async (opts?: { append?: boolean }) => {
    if (!profile?.org_id) {
      setRows([])
      setLoading(false)
      setHasMore(false)
      return
    }

    const append = Boolean(opts?.append)
    const before = append ? rows[rows.length - 1]?.created_at : null

    if (append) setLoadingMore(true)
    else setLoading(true)

    let q = supabase
      .from('tickets')
      .select('id, title, status, ticket_date, amount, currency, vendor, created_at, deleted_at')
      .eq('org_id', profile.org_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (before) q = q.lt('created_at', before)

    const { data, error } = await q

    if (error) {
      setListError(error.message)
      if (!append) setRows([])
      setLoading(false)
      setLoadingMore(false)
      return
    }

    const page = (data ?? []) as TicketRow[]
    const next = page.slice(0, PAGE_SIZE)

    setListError(null)
    setHasMore(page.length > PAGE_SIZE)
    setRows((prev) => (append ? [...prev, ...next] : next))
    if (!append) setSelected(() => new Set())
    setLoading(false)
    setLoadingMore(false)
  }

  useEffect(() => {
    load()
  }, [profile?.org_id])

  const createTicket = async () => {
    if (!profile?.org_id || !session?.user) return
    if (!form.title.trim()) return

    setCreating(true)
    setFormError(null)
    setFlash(null)

    const parsedAmount = form.amount.trim() ? Number(form.amount) : null
    const res = await supabase
      .from('tickets')
      .insert({
        org_id: profile.org_id,
        owner_user_id: session.user.id,
        title: form.title.trim(),
        vendor: form.vendor.trim() ? form.vendor.trim() : null,
        amount: parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null,
        currency: 'EUR',
        status: 'draft',
      })
      .select('id')
      .single()

    setCreating(false)

    if (res.error) {
      setFormError(res.error.message)
      return
    }

    await appendAudit({
      org_id: profile.org_id,
      action: 'TICKET_CREATE',
      resource_type: 'ticket',
      resource_id: res.data?.id ?? null,
      metadata: { created_from: 'tickets_list' },
    })

    setForm({ title: '', vendor: '', amount: '' })
    await load()
  }

  const createFromCapturedFile = async (file: File) => {
    if (!profile?.org_id || !session?.user) return
    if (!canWrite) return

    if (file.size > MAX_BYTES) {
      setFormError(`El archivo supera el límite (${Math.round(MAX_BYTES / (1024 * 1024))}MB).`)
      return
    }

    if (!isAllowedType(file)) {
      setFormError('Formato no permitido. Admite PDF, imágenes y XML.')
      return
    }

    setCaptureBusy(true)
    setFormError(null)
    setFlash(null)

    try {
      let ocr: Awaited<ReturnType<typeof runReceiptOcr>> | null = null

      if (file.type.startsWith('image/')) {
        try {
          ocr = await runReceiptOcr(file)
        } catch {
          ocr = null
        }
      }

      const title =
        ocr?.vendor?.trim() ||
        (ocr?.date ? `Ticket ${ocr.date}` : '') ||
        file.name.replace(/\.[^.]+$/, '') ||
        'Ticket'

      const ticketRes = await supabase
        .from('tickets')
        .insert({
          org_id: profile.org_id,
          owner_user_id: session.user.id,
          title,
          vendor: ocr?.vendor?.trim() || null,
          ticket_date: ocr?.date || null,
          amount: ocr?.total ?? null,
          currency: 'EUR',
          status: 'draft',
        })
        .select('id')
        .single()

      if (ticketRes.error) throw ticketRes.error

      const ticketId = ticketRes.data?.id
      if (!ticketId) throw new Error('No se pudo crear el ticket.')

      const sha256 = await sha256HexFile(file)
      const safeName = buildReceiptFilename({
        date: ocr?.date ?? null,
        concept: title,
        originalName: file.name,
        mimeType: file.type,
      })
      const objectPath = `org_${profile.org_id}/tickets/${ticketId}/${safeRandomId()}-${safeName}`
      const bucket = 'tickets-cotepa'

      const up = await supabase.storage.from(bucket).upload(objectPath, file, {
        upsert: false,
        contentType: file.type || undefined,
      })

      if (up.error) throw up.error

      const ins = await supabase.from('ticket_files').insert({
        org_id: profile.org_id,
        ticket_id: ticketId,
        filename: safeName,
        mimetype: file.type || null,
        byte_size: file.size,
        storage_bucket: bucket,
        storage_path: objectPath,
        sha256,
      })

      if (ins.error) throw ins.error

      await appendAudit({
        org_id: profile.org_id,
        action: 'TICKET_FILE_UPLOAD',
        resource_type: 'ticket',
        resource_id: ticketId,
        metadata: { filename: safeName, sha256, byte_size: file.size, mimetype: file.type, created_from: 'tickets_list' },
      })

      await load()
      navigate(`/tickets/${ticketId}`)
    } catch (e: any) {
      setFormError(e?.message ?? 'No se pudo capturar el ticket.')
    } finally {
      setCaptureBusy(false)
    }
  }

  const deleteRow = async (r: TicketRow) => {
    if (!profile?.org_id) return
    if (!canWrite) return
    if (deletingId) return

    const ok = window.confirm(`¿Eliminar el ticket "${r.title}"? Esta acción no se puede revertir.`)
    if (!ok) return

    setDeletingId(r.id)
    setFlash(null)

    try {
      await softDeleteTicket({ org_id: profile.org_id, ticket_id: r.id, reason: 'deleted_from_tickets_list' })

      setRows((prev) => prev.filter((x) => x.id !== r.id))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(r.id)
        return next
      })
      setFlash({ type: 'success', text: 'Ticket eliminado.' })
    } catch (e: any) {
      setFlash({ type: 'error', text: e?.message ?? 'No se pudo eliminar el ticket.' })
    } finally {
      setDeletingId(null)
    }
  }

  const visibleColumns = listLayout.fields.filter((f) => f.visible !== false)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm text-zinc-500">Tickets</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Tickets y recibos</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-900">Crear ticket</div>
            <div className="mt-1 text-sm text-zinc-600">También puedes sacar la foto del ticket directamente desde aquí.</div>
          </div>
          <div className="flex w-full sm:w-auto">
            <input
              ref={captureInputRef}
              aria-label="Capturar ticket"
              className="hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void createFromCapturedFile(f)
                e.currentTarget.value = ''
              }}
              disabled={!canWrite || captureBusy || creating}
            />
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!canWrite || captureBusy || creating}
              onClick={() => captureInputRef.current?.click()}
            >
              {captureBusy ? 'Procesando foto…' : 'Capturar ticket'}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          {formLayout.fields
            .filter((f) => f.visible !== false)
            .map((f) => {
              if (f.key === 'title') {
                return (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    disabled={!canWrite}
                    required={f.required}
                  />
                )
              }
              if (f.key === 'vendor') {
                return (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    value={form.vendor}
                    onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))}
                    disabled={!canWrite}
                    required={f.required}
                  />
                )
              }
              if (f.key === 'amount') {
                return (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    disabled={!canWrite}
                    required={f.required}
                  />
                )
              }
              return null
            })}
          <Button
            type="button"
            className="w-full md:w-auto"
            onClick={createTicket}
            disabled={!canWrite || creating || captureBusy || !form.title.trim()}
          >
            {creating ? 'Creando…' : 'Crear'}
          </Button>
        </div>
        {formError ? <div className="mt-3 text-sm text-rose-600">{formError}</div> : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-medium text-zinc-900">Últimos tickets</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              disabled={!canDownload || exporting || selected.size === 0}
              onClick={async () => {
                if (!profile?.org_id) return
                if (!canDownload) return
                const ids = Array.from(selected)
                if (ids.length === 0) return

                setExporting(true)
                setExportError(null)

                try {
                  const fRes = await supabase
                    .from('ticket_files')
                    .select('id, ticket_id, filename, mimetype, byte_size, storage_bucket, storage_path, sha256')
                    .eq('org_id', profile.org_id)
                    .in('ticket_id', ids)

                  if (fRes.error) throw fRes.error

                  const files = ((fRes.data ?? []) as TicketFileRow[]).filter((f) => (f.mimetype ?? '').startsWith('image/'))
                  if (files.length === 0) {
                    setExportError('No hay imágenes asociadas a los tickets seleccionados.')
                    return
                  }

                  const items: Array<{ filename: string; blob: Blob; file: TicketFileRow }> = []

                  for (const f of files) {
                    const { signed_url } = await signDownloadUrl({
                      bucket: f.storage_bucket,
                      path: f.storage_path,
                      resource_type: 'ticket_file',
                      resource_id: f.id,
                    })

                    const res = await fetch(signed_url)
                    if (!res.ok) throw new Error(`No se pudo descargar ${f.filename}`)
                    const blob = await res.blob()
                    items.push({ filename: f.filename, blob, file: f })

                    await appendAudit({
                      org_id: profile.org_id,
                      action: 'TICKET_FILE_DOWNLOAD',
                      resource_type: 'ticket_file',
                      resource_id: f.id,
                      metadata: { filename: f.filename, sha256: f.sha256 },
                    })
                  }

                  const zip = await createZipBlob(items.map((i) => ({ filename: i.filename, blob: i.blob })))
                  const zipName = `tickets-${new Date().toISOString().slice(0, 10)}.zip`
                  downloadBlob(zip, zipName)
                } catch (e: any) {
                  setExportError(e?.message ?? 'No se pudieron descargar las imágenes.')
                } finally {
                  setExporting(false)
                }
              }}
            >
              {exporting ? 'Preparando…' : 'Descargar imágenes'}
            </Button>

            {canShare ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                disabled={!canDownload || exporting || selected.size === 0}
                onClick={async () => {
                  if (!profile?.org_id) return
                  if (!canDownload) return
                  const ids = Array.from(selected)
                  if (ids.length === 0) return

                  setExporting(true)
                  setExportError(null)

                  try {
                    const fRes = await supabase
                      .from('ticket_files')
                      .select('id, ticket_id, filename, mimetype, byte_size, storage_bucket, storage_path, sha256')
                      .eq('org_id', profile.org_id)
                      .in('ticket_id', ids)

                    if (fRes.error) throw fRes.error

                    const files = ((fRes.data ?? []) as TicketFileRow[]).filter((f) => (f.mimetype ?? '').startsWith('image/'))
                    if (files.length === 0) {
                      setExportError('No hay imágenes asociadas a los tickets seleccionados.')
                      return
                    }

                    if (files.length === 1) {
                      const f = files[0]
                      const { signed_url } = await signDownloadUrl({
                        bucket: f.storage_bucket,
                        path: f.storage_path,
                        resource_type: 'ticket_file',
                        resource_id: f.id,
                      })
                      const res = await fetch(signed_url)
                      if (!res.ok) throw new Error(`No se pudo descargar ${f.filename}`)
                      const blob = await res.blob()
                      const shareFile = new File([blob], f.filename, { type: f.mimetype ?? 'application/octet-stream' })
                      await (navigator as any).share({ files: [shareFile], title: 'Ticket' })
                    } else {
                      const items: Array<{ filename: string; blob: Blob; file: TicketFileRow }> = []
                      for (const f of files) {
                        const { signed_url } = await signDownloadUrl({
                          bucket: f.storage_bucket,
                          path: f.storage_path,
                          resource_type: 'ticket_file',
                          resource_id: f.id,
                        })
                        const res = await fetch(signed_url)
                        if (!res.ok) throw new Error(`No se pudo descargar ${f.filename}`)
                        const blob = await res.blob()
                        items.push({ filename: f.filename, blob, file: f })
                      }

                      const zip = await createZipBlob(items.map((i) => ({ filename: i.filename, blob: i.blob })))
                      const zipName = `tickets-${new Date().toISOString().slice(0, 10)}.zip`
                      const shareFile = new File([zip], zipName, { type: 'application/zip' })
                      await (navigator as any).share({ files: [shareFile], title: 'Tickets' })
                    }
                  } catch (e: any) {
                    setExportError(e?.message ?? 'No se pudieron compartir las imágenes.')
                  } finally {
                    setExporting(false)
                  }
                }}
              >
                {exporting ? 'Preparando…' : 'Compartir imágenes'}
              </Button>
            ) : null}
          </div>
        </div>

        {exportError ? <div className="px-5 pb-4 text-sm text-rose-600">{exportError}</div> : null}
        {listError ? <div className="px-5 pb-4 text-sm text-rose-600">{listError}</div> : null}
        {flash ? (
          <div className="px-5 pb-4 text-sm" aria-live="polite">
            <span className={flash.type === 'success' ? 'text-emerald-700' : 'text-rose-600'}>{flash.text}</span>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="[&>th]:px-5 [&>th]:py-3">
                <th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={allSelected}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSelected(() => {
                        if (!checked) return new Set()
                        return new Set(rows.map((r) => r.id))
                      })
                    }}
                    disabled={!canDownload || exporting || rows.length === 0}
                  />
                </th>
                {visibleColumns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th className="w-44">Acciones</th>
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
                    Sin tickets todavía.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${r.title}`}
                        checked={selected.has(r.id)}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(r.id)
                            else next.delete(r.id)
                            return next
                          })
                        }}
                        disabled={!canDownload || exporting}
                      />
                    </td>
                    {visibleColumns.map((c) => {
                      if (c.key === 'title') {
                        return (
                          <td key={c.key} className="px-5 py-4">
                            <Link className="font-medium text-zinc-900 hover:underline" to={`/tickets/${r.id}`}>
                              {r.title}
                            </Link>
                          </td>
                        )
                      }
                      if (c.key === 'vendor') {
                        return (
                          <td key={c.key} className="px-5 py-4 text-zinc-700">
                            {r.vendor ?? '—'}
                          </td>
                        )
                      }
                      if (c.key === 'amount') {
                        return (
                          <td key={c.key} className="px-5 py-4 text-zinc-700">
                            {r.amount != null ? `${r.amount.toFixed(2)} ${r.currency ?? ''}` : '—'}
                          </td>
                        )
                      }
                      if (c.key === 'status') {
                        return (
                          <td key={c.key} className="px-5 py-4">
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                              {getTicketStatusLabel(r.status)}
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
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="w-full whitespace-nowrap sm:w-auto"
                          onClick={() => navigate(`/tickets/${r.id}`)}
                        >
                          Abrir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          className="w-full whitespace-nowrap sm:w-auto"
                          disabled={!canWrite || exporting || deletingId === r.id}
                          onClick={() => void deleteRow(r)}
                        >
                          {deletingId === r.id ? 'Eliminando…' : 'Eliminar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {hasMore ? (
          <div className="border-t border-zinc-200 px-5 py-4">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loadingMore || loading || exporting}
              onClick={() => void load({ append: true })}
            >
              {loadingMore ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

