import { Permission } from '@/core/rbac/permissions'
import type { ModuleManifest } from '@/core/modules/types'
import TicketDetail from '@/modules/tickets/pages/TicketDetail'
import TicketsList from '@/modules/tickets/pages/TicketsList'
import { ReceiptText } from 'lucide-react'

export const ticketsModule: ModuleManifest = {
  id: 'tickets',
  name: 'Tickets',
  version: '0.1.0',
  requiredPermissions: [Permission.TicketsRead, Permission.TicketsWrite, Permission.TicketsDownload],
  routes: [
    { path: '/tickets', Component: TicketsList, requiredPermissions: [Permission.TicketsRead] },
    { path: '/tickets/:id', Component: TicketDetail, requiredPermissions: [Permission.TicketsRead] },
  ],
  navItems: [
    { label: 'Tickets', path: '/tickets', icon: ReceiptText, requiredPermissions: [Permission.TicketsRead] },
  ],
}
