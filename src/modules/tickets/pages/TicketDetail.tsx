import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { appendAudit } from '@/core/audit/audit'
import { sanitizeFilename } from '@/core/files/sanitize'
import { sha256HexFile } from '@/core/files/sha256'
import { runReceiptOcr } from '@/core/ocr/receiptOcr'
import { signDownloadUrl } from '@/core/storage/signedUrls'
import { Permission } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TicketFilesCard } from '@/modules/tickets/components/TicketFilesCard'
import type { Ticket, TicketFile } from '@/modules/tickets/types'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

const MAX_BYTES = 15 * 1024 * 1024

function isAllowedType(file: File) {
  if (file.type === 'application/pdf') return true
  if (file.type.startsWith('image/')) return true
  if (file.type === 'text/xml') return true
  if (file.type === 'application/xml') return true
  return false
}

export default function TicketDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const { permissions } = usePermissions()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [files, setFiles] = useState<TicketFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', vendor: '', ticket_date: '', amount: '' })
  const [saving, setSaving] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrInfo, setOcrInfo] = useState<string | null>(null)

  const canWrite = permissions.has(Permission.TicketsWrite)
  const canDownload = permissions.has(Permission.TicketsDownload)

  const load = async () => {
    if (!id || !profile?.org_id) {
      setTicket(null)
      setFiles([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [tRes, fRes] = await Promise.all([
      supabase
        .from('tickets')
        .select('id, title, status, ticket_date, amount, currency, vendor')
        .eq('id', id)
        .eq('org_id', profile.org_id)
        .single(),
      supabase
        .from('ticket_files')
        .select('id, filename, mimetype, byte_size, storage_bucket, storage_path, sha256, created_at')
        .eq('org_id', profile.org_id)
        .eq('ticket_id', id)
        .order('created_at', { ascending: false }),
    ])

    if (tRes.error) {
      setError(tRes.error.message)
      setTicket(null)
      setFiles([])
      setLoading(false)
      return
    }

    setTicket(tRes.data as Ticket)
    setFiles((fRes.data ?? []) as TicketFile[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id, profile?.org_id])

  useEffect(() => {
    if (!ticket) return
    setForm({
      title: ticket.title ?? '',
      vendor: ticket.vendor ?? '',
      ticket_date: ticket.ticket_date ?? '',
      amount: ticket.amount != null ? String(ticket.amount) : '',
    })
  }, [ticket?.id])

  const subtitle = useMemo(() => {
    if (!ticket) return ''
    const parts = []
    if (ticket.vendor) parts.push(ticket.vendor)
    if (ticket.amount != null) parts.push(`${ticket.amount.toFixed(2)} ${ticket.currency ?? ''}`.trim())
    return parts.join(' · ')
  }, [ticket])

  const onUpload = async (file: File) => {
    if (!id || !profile?.org_id) return
    if (!canWrite) return

    if (file.size > MAX_BYTES) {
      setError(`El archivo supera el límite (${Math.round(MAX_BYTES / (1024 * 1024))}MB).`)
      return
    }

    if (!isAllowedType(file)) {
      setError('Formato no permitido. Admite PDF, imágenes y XML.')
      return
    }

    setBusy(true)
    setError(null)
    setOcrInfo(null)

    try {
      if (file.type.startsWith('image/')) {
        setOcrRunning(true)
        setOcrProgress(0)
        try {
          const ocr = await runReceiptOcr(file, {
            onProgress: (p) => setOcrProgress(Math.max(0, Math.min(1, p))),
          })

          setForm((prev) => ({
            ...prev,
            vendor: prev.vendor.trim() ? prev.vendor : ocr.vendor ?? prev.vendor,
            ticket_date: prev.ticket_date ? prev.ticket_date : ocr.date ?? prev.ticket_date,
            amount: prev.amount.trim() ? prev.amount : ocr.total != null ? ocr.total.toFixed(2) : prev.amount,
            title: prev.title.trim()
              ? prev.title
              : ocr.vendor
                ? ocr.vendor
                : ocr.date
                  ? `Ticket ${ocr.date}`
                  : prev.title,
          }))

          setOcrInfo('Datos extraídos del ticket. Revisa y guarda si hace falta.')
        } catch (e: any) {
          setOcrInfo(e?.message ? `OCR: ${e.message}` : 'OCR: no se pudo procesar la imagen.')
        } finally {
          setOcrRunning(false)
        }
      }

      const sha256 = await sha256HexFile(file)
      const safeName = sanitizeFilename(file.name)
      const objectPath = `org_${profile.org_id}/tickets/${id}/${crypto.randomUUID()}-${safeName}`
      const bucket = 'tickets-cotepa'

      const up = await supabase.storage.from(bucket).upload(objectPath, file, {
        upsert: false,
        contentType: file.type || undefined,
      })

      if (up.error) throw up.error

      const ins = await supabase.from('ticket_files').insert({
        org_id: profile.org_id,
        ticket_id: id,
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
        resource_id: id,
        metadata: { filename: safeName, sha256, byte_size: file.size, mimetype: file.type },
      })

      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Error al subir el archivo.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!id || !profile?.org_id) return
    if (!canWrite) return

    const title = form.title.trim()
    if (!title) {
      setError('El título es obligatorio.')
      return
    }

    setSaving(true)
    setError(null)

    const parsedAmount = form.amount.trim() ? Number(form.amount) : null
    const amount = parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null

    const res = await supabase
      .from('tickets')
      .update({
        title,
        vendor: form.vendor.trim() ? form.vendor.trim() : null,
        ticket_date: form.ticket_date ? form.ticket_date : null,
        amount,
      })
      .eq('id', id)
      .eq('org_id', profile.org_id)

    setSaving(false)

    if (res.error) {
      setError(res.error.message)
      return
    }

    await appendAudit({
      org_id: profile.org_id,
      action: 'TICKET_UPDATE',
      resource_type: 'ticket',
      resource_id: id,
      metadata: { title, vendor: form.vendor.trim() || null, ticket_date: form.ticket_date || null, amount },
    })

    await load()
  }

  const download = async (f: TicketFile) => {
    if (!canDownload) return
    if (!profile?.org_id) return

    setBusy(true)
    setError(null)

    try {
      const { signed_url } = await signDownloadUrl({
        bucket: f.storage_bucket,
        path: f.storage_path,
        resource_type: 'ticket_file',
        resource_id: f.id,
      })

      await appendAudit({
        org_id: profile.org_id,
        action: 'TICKET_FILE_DOWNLOAD',
        resource_type: 'ticket_file',
        resource_id: f.id,
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

  if (loading) {
    return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">Cargando…</div>
  }

  if (!ticket) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-900">No encontrado</div>
          <div className="mt-2 text-sm text-zinc-600">No se puede acceder a este ticket.</div>
          <div className="mt-4">
            <Link className="text-sm text-zinc-900 underline underline-offset-4" to="/tickets">
              Volver a tickets
            </Link>
          </div>
        </div>
        {error ? <div className="text-sm text-rose-600">{error}</div> : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm text-zinc-500">
            <Link className="hover:underline" to="/tickets">
              Tickets
            </Link>{' '}
            / {ticket.title}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{ticket.title}</h1>
          {subtitle ? <div className="mt-1 text-sm text-zinc-600">{subtitle}</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-900">Datos</div>
            <div className="mt-1 text-sm text-zinc-600">Puedes completar o corregir los datos detectados por OCR.</div>
          </div>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={save}
            disabled={!canWrite || saving || busy || ocrRunning}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Título" />
          <Input value={form.vendor} onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))} placeholder="Establecimiento" />
          <Input type="date" value={form.ticket_date} onChange={(e) => setForm((p) => ({ ...p, ticket_date: e.target.value }))} />
          <Input
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="Importe total"
          />
        </div>

        {ocrRunning ? (
          <div className="mt-3 text-xs text-zinc-500">OCR: {Math.round(ocrProgress * 100)}%</div>
        ) : ocrInfo ? (
          <div className="mt-3 text-xs text-zinc-600">{ocrInfo}</div>
        ) : null}

        {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
      </div>

      <TicketFilesCard
        files={files}
        busy={busy}
        canWrite={canWrite}
        canDownload={canDownload}
        error={null}
        onUpload={onUpload}
        onDownload={download}
      />
    </div>
  )
}
