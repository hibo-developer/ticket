import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { appendAudit } from '@/core/audit/audit'
import { sanitizeFilename } from '@/core/files/sanitize'
import { sha256HexFile } from '@/core/files/sha256'
import { signDownloadUrl } from '@/core/storage/signedUrls'
import { Permission } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
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

    try {
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
      <div className="flex items-end justify-between gap-4">
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

      <TicketFilesCard
        files={files}
        busy={busy}
        canWrite={canWrite}
        canDownload={canDownload}
        error={error}
        onUpload={onUpload}
        onDownload={download}
      />
    </div>
  )
}
