export type Ticket = {
  id: string
  org_id?: string
  owner_user_id?: string
  title: string
  status: string
  ticket_date: string | null
  amount: number | null
  currency: string | null
  vendor: string | null
  error_code?: string | null
  error_message?: string | null
  recreated_from_ticket_id?: string | null
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
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
