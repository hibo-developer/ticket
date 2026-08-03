export type Ticket = {
  id: string
  title: string
  status: string
  ticket_date: string | null
  amount: number | null
  currency: string | null
  vendor: string | null
}

export type TicketFile = {
  id: string
  filename: string
  mimetype: string | null
  byte_size: number | null
  storage_bucket: string
  storage_path: string
  sha256: string
  created_at: string
}

