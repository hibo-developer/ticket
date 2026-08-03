import { Button } from '@/components/ui/Button'
import { useAuth } from '@/core/auth/AuthContext'
import { useNavigation } from '@/core/layout/useNavigation'
import { cn } from '@/lib/utils'
import { LogOut } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const { navItems } = useNavigation()
  const location = useLocation()
  const activeItem = navItems.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-zinc-500">Tickets Cotepa</div>
            <div className="truncate text-base font-semibold text-zinc-900">{activeItem?.label ?? 'Panel'}</div>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </div>

        <nav className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors',
                  active ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700',
                )}
              >
                <item.icon className={cn('h-4 w-4', active ? 'text-white' : 'text-zinc-500')} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-4 md:px-6 md:py-6">
        <aside className="hidden w-64 flex-none md:block">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500">Tickets Cotepa</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">Panel</div>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                      active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100',
                    )}
                  >
                    <item.icon className={cn('h-4 w-4', active ? 'text-white' : 'text-zinc-500')} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="mt-5 border-t border-zinc-200 pt-4">
              <div className="text-xs text-zinc-500">Usuario</div>
              <div className="mt-1 truncate text-sm text-zinc-900">{profile?.full_name ?? profile?.id ?? '—'}</div>
              <Button
                className="mt-3 w-full justify-center"
                variant="ghost"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-6">{children}</main>
      </div>
    </div>
  )
}

