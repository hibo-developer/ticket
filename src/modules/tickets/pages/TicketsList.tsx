import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { appendAudit } from '@/core/audit/audit'
import { downloadBlob } from '@/core/files/download'
import { createZipBlob } from '@/core/files/zip'
import { usePermissions } from '@/core/rbac/usePermissions'
import { Permission } from '@/core/rbac/permissions'
import { signDownloadUrl } from '@/core/storage/signedUrls'
import { useViewLayout } from '@/core/views/useViewLayout'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type TicketRow = {
  id: string
  title: string
  status: string
  ticket_date: string | null
  amount: number | null
  currency: string | null
  vendor: string | null
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

export default function TicketsList() {
  const { profile, session } = useAuth()
  const { permissions } = usePermissions()
  const { layout: formLayout } = useViewLayout('tickets.form')
  const { layout: listLayout } = useViewLayout('tickets.list')

  const [form, setForm] = useState({ title: '', vendor: '', amount: '' })
  const [rows, setRows] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const canWrite = permissions.has(Permission.TicketsWrite)
  const canDownload = permissions.has(Permission.TicketsDownload)

  const load = async () => {
    if (!profile?.org_id) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('tickets')
      .select('id, title, status, ticket_date, amount, currency, vendor')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      setError(error.message)
      setRows([])
      setLoading(false)
      return
    }

    setError(null)
    setRows((data ?? []) as TicketRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [profile?.org_id])

  const createTicket = async () => {
    if (!profile?.org_id || !session?.user) return
    if (!form.title.trim()) return

    setCreating(true)
    setError(null)

    const parsedAmount = form.amount.trim() ? Number(form.amount) : null
    const { error } = await supabase.from('tickets').insert({
      org_id: profile.org_id,
      owner_user_id: session.user.id,
      title: form.title.trim(),
      vendor: form.vendor.trim() ? form.vendor.trim() : null,
      amount: parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null,
      currency: 'EUR',
      status: 'draft',
    })

    setCreating(false)

    if (error) {
      setError(error.message)
      return
    }

    setForm({ title: '', vendor: '', amount: '' })
    await load()
  }

  const visibleColumns = listLayout.fields.filter((f) => f.visible !== false)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Tickets</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Tickets y recibos</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Crear ticket</div>
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
          <Button type="button" onClick={createTicket} disabled={!canWrite || creating || !form.title.trim()}>
            {creating ? 'Creando…' : 'Crear'}
          </Button>
        </div>
        {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-medium text-zinc-900">Últimos tickets</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
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

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="[&>th]:px-5 [&>th]:py-3">
                <th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={rows.length > 0 && selected.size === rows.length}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td className="px-5 py-4 text-zinc-500" colSpan={visibleColumns.length}>
                    Cargando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-4 text-zinc-500" colSpan={visibleColumns.length}>
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
                              {r.status}
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

