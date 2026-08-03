import { TicketFilesCard } from '@/modules/tickets/components/TicketFilesCard'
import type { TicketFile } from '@/modules/tickets/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

describe('TicketFilesCard', () => {
  it('dispara descarga', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn()
    const onUpload = vi.fn()

    const files: TicketFile[] = [
      {
        id: 'f1',
        filename: 'ticket.pdf',
        mimetype: 'application/pdf',
        byte_size: 1234,
        storage_bucket: 'tickets-cotepa',
        storage_path: 'org_o1/tickets/x/ticket.pdf',
        sha256: 'a'.repeat(64),
        created_at: new Date().toISOString(),
      },
    ]

    render(
      <TicketFilesCard
        files={files}
        busy={false}
        canWrite={false}
        canDownload
        error={null}
        onUpload={onUpload}
        onDownload={onDownload}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Descargar' }))
    expect(onDownload).toHaveBeenCalledWith(files[0])
  })
})

