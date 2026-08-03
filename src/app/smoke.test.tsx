import App from '@/App'
import Admin from '@/pages/Admin'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'
import Setup from '@/pages/Setup'
import ExpenseDetail from '@/modules/expenses/pages/ExpenseDetail'
import ExpensesList from '@/modules/expenses/pages/ExpensesList'
import Reports from '@/modules/reports/pages/Reports'
import TicketDetail from '@/modules/tickets/pages/TicketDetail'
import TicketsList from '@/modules/tickets/pages/TicketsList'
import { AllPermissions } from '@/core/rbac/permissions'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

type AuthState = {
  session: any
  profile: any
  loading: boolean
  signOut: () => Promise<void>
}

const authStateRef = vi.hoisted(() => ({
  current: {
    session: { user: { id: 'u1', email: 'user@test.local' } },
    profile: { id: 'u1', org_id: 'o1', full_name: 'Usuario', app_role: 'admin', active: true },
    loading: false,
    signOut: async () => {},
  } as AuthState,
}))

afterEach(() => {
  cleanup()
  authStateRef.current = {
    session: { user: { id: 'u1', email: 'user@test.local' } },
    profile: { id: 'u1', org_id: 'o1', full_name: 'Usuario', app_role: 'admin', active: true },
    loading: false,
    signOut: async () => {},
  }
})

vi.mock('@/core/auth/AuthContext', async () => {
  const actual: any = await vi.importActual('@/core/auth/AuthContext')
  return {
    ...actual,
    useAuth: () => authStateRef.current,
    AuthProvider: ({ children }: any) => children,
  }
})

vi.mock('@/core/rbac/usePermissions', () => {
  return {
    usePermissions: () => ({
      loading: false,
      permissions: new Set(AllPermissions),
    }),
  }
})

const supabaseMock = vi.hoisted(() => {
  const builder = (result: any) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      insert: () => Promise.resolve({ error: null, data: null }),
      upsert: () => Promise.resolve({ error: null, data: null }),
      delete: () => q,
      single: () => Promise.resolve(result.single ?? { data: null, error: null }),
      maybeSingle: () => Promise.resolve(result.single ?? { data: null, error: null }),
      then: (resolve: any, reject: any) =>
        Promise.resolve(result.list ?? { data: [], error: null, count: 0 }).then(resolve, reject),
    }
    return q
  }

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: authStateRef.current.session } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: authStateRef.current.session.user } }),
    },
    from: (table: string) => {
      if (table === 'tickets') {
        return builder({
          single: {
            data: {
              id: 't1',
              title: 'Ticket demo',
              status: 'draft',
              ticket_date: null,
              amount: 10,
              currency: 'EUR',
              vendor: 'Proveedor',
            },
            error: null,
          },
          list: { data: [], error: null, count: 0 },
        })
      }
      if (table === 'expenses') {
        return builder({
          single: {
            data: {
              id: 'e1',
              state: 'draft',
              expense_date: '2026-01-01',
              total_amount: 10,
              currency: 'EUR',
              category: 'Transporte',
            },
            error: null,
          },
          list: { data: [], error: null, count: 0 },
        })
      }
      return builder({ list: { data: [], error: null, count: 0 } })
    },
    storage: {
      from: () => ({ upload: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { signed_url: 'https://example.test/file', expires_in: 60 }, error: null }),
    },
  }
})

vi.mock('@/core/auth/supabaseClient', () => ({ supabase: supabaseMock }))

describe('smoke', () => {
  it('renderiza Login', () => {
    authStateRef.current = { ...authStateRef.current, session: null, profile: null }
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )
    expect(screen.getByText('Acceso seguro a tickets y gastos')).toBeInTheDocument()
  })

  it('muestra un mensaje claro cuando Supabase rechaza el login por configuración de auth', async () => {
    authStateRef.current = { ...authStateRef.current, session: null, profile: null }
    supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Auth is disabled' } })
    supabaseMock.auth.signInWithOtp.mockResolvedValueOnce({ error: { message: 'Auth is disabled' } })

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.local' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar con email' }))

    expect(await screen.findByText(/La autenticación por correo/i)).toBeInTheDocument()
  })

  it('envía un enlace mágico cuando la contraseña no está disponible', async () => {
    authStateRef.current = { ...authStateRef.current, session: null, profile: null }
    supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Auth is disabled' } })
    supabaseMock.auth.signInWithOtp.mockResolvedValueOnce({ error: null })

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.local' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar con email' }))

    expect(await screen.findByText(/hemos enviado un enlace/i)).toBeInTheDocument()
  })

  it('usa un enlace mágico para el acceso cuando se intenta crear cuenta', async () => {
    authStateRef.current = { ...authStateRef.current, session: null, profile: null }
    supabaseMock.auth.signInWithOtp.mockResolvedValueOnce({ error: null })
    supabaseMock.auth.signUp.mockReset()
    supabaseMock.auth.signInWithPassword.mockReset()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.local' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace mágico/i }))

    expect(await screen.findByText(/enlace mágico/i)).toBeInTheDocument()
    expect(supabaseMock.auth.signUp).not.toHaveBeenCalled()
    expect(supabaseMock.auth.signInWithOtp).toHaveBeenCalled()
  })

  it('renderiza Setup cuando falta profile', () => {
    authStateRef.current = { ...authStateRef.current, profile: null }
    render(
      <MemoryRouter>
        <Setup />
      </MemoryRouter>,
    )
    expect(screen.getByText('Configuración inicial')).toBeInTheDocument()
  })

  it('renderiza NotFound', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument()
  })

  it('renderiza App en /login', () => {
    authStateRef.current = { ...authStateRef.current, session: null, profile: null }
    window.history.pushState({}, '', '/login')
    render(<App />)
    expect(screen.getByText('Iniciar sesión')).toBeInTheDocument()
  })

  it('renderiza Dashboard dentro del shell', async () => {
    authStateRef.current = { ...authStateRef.current, profile: { ...authStateRef.current.profile, app_role: 'admin' } }
    render(
      <MemoryRouter initialEntries={['/']}>
        <Dashboard />
      </MemoryRouter>,
    )
    expect(screen.getByText('Tickets Cotepa')).toBeInTheDocument()
  })

  it('renderiza Admin', async () => {
    authStateRef.current = {
      ...authStateRef.current,
      profile: { id: 'u1', org_id: 'o1', full_name: 'Usuario', app_role: 'admin', active: true },
    }
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Administración')).toBeInTheDocument()
  })

  it('renderiza módulos', () => {
    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <Routes>
          <Route path="/tickets" element={<TicketsList />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/gastos" element={<ExpensesList />} />
          <Route path="/gastos/:id" element={<ExpenseDetail />} />
          <Route path="/informes" element={<Reports />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Tickets y recibos')).toBeInTheDocument()
  })
})
