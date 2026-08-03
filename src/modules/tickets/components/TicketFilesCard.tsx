import { Button } from '@/components/ui/Button'
import type { TicketFile } from '@/modules/tickets/types'

export function TicketFilesCard({
  files,
  busy,
  canWrite,
  canDownload,
  error,
  onUpload,
  onDownload,
}: {
  files: TicketFile[]
  busy: boolean
  canWrite: boolean
  canDownload: boolean
  error: string | null
  onUpload: (file: File) => void
  onDownload: (file: TicketFile) => void
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-900">Adjuntos</div>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            className="hidden"
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.currentTarget.value = ''
            }}
            disabled={!canWrite || busy}
          />
          <Button type="button" disabled={!canWrite || busy}>
            {busy ? 'Procesando…' : 'Subir archivo'}
          </Button>
        </label>
      </div>

      {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}

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
                  Sin adjuntos.
                </td>
              </tr>
            ) : (
              files.map((f) => (
                <tr key={f.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-3 font-medium text-zinc-900">{f.filename}</td>
                  <td className="px-3 py-3 text-zinc-600">{f.mimetype ?? '—'}</td>
                  <td className="px-3 py-3 text-zinc-600">
                    {f.byte_size != null ? `${Math.round(f.byte_size / 1024)} KB` : '—'}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-zinc-600">{f.sha256.slice(0, 16)}…</td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onDownload(f)}
                      disabled={!canDownload || busy}
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
  )
}

