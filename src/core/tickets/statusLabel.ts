export function getTicketStatusLabel(status: string | null | undefined) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'draft':
      return 'Borrador'
    case 'deleted':
      return 'Eliminado'
    case 'error':
      return 'Error'
    case 'processed':
      return 'Procesado'
    case 'approved':
      return 'Aprobado'
    case 'rejected':
      return 'Rechazado'
    default:
      return status ?? '—'
  }
}
