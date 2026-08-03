import { supabase } from '@/core/auth/supabaseClient'
import { useAuth } from '@/core/auth/AuthContext'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

const PASSWORD_AUTH_DISABLED = ['disabled', 'not enabled', 'invalid_grant']

export default function Login() {
  const { session } = useAuth()
  const location = useLocation()
  const from = (location.state as any)?.from ?? '/'

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (session) return <Navigate to={from} replace />

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (mode === 'login') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        const message = authError.message.toLowerCase()
        const needsFallback = PASSWORD_AUTH_DISABLED.some((token) => message.includes(token))

        if (needsFallback) {
          const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
          if (otpError) {
            setError('La autenticación por correo y contraseña no está habilitada en este proyecto de Supabase. Activa el flujo de auth en el panel o usa un método de acceso compatible y vuelve a intentarlo.')
          } else {
            setSuccess('Hemos enviado un enlace mágico a tu correo. Ábrelo para entrar y completa el acceso.')
          }
        } else {
          setError(authError.message)
        }
      }
    } else {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
      if (otpError) {
        setError('No pudimos enviar el enlace mágico. Revisa la configuración de Auth en Supabase y vuelve a intentarlo.')
      } else {
        setSuccess('Hemos enviado un enlace mágico a tu correo para entrar. Completa el acceso desde el email.')
      }
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6">
        <div className="grid w-full grid-cols-1 gap-10 md:grid-cols-2">
          <div className="flex flex-col justify-center">
            <div className="text-sm text-zinc-400">Tickets Cotepa</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Acceso seguro a tickets y gastos</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-zinc-300">
              Una PWA empresarial modular con control de permisos, auditoría y descargas seguras de adjuntos.
            </p>
            <div className="mt-8 flex gap-3 text-xs text-zinc-400">
              <div className="rounded-full border border-zinc-800 px-3 py-1">RBAC</div>
              <div className="rounded-full border border-zinc-800 px-3 py-1">Auditoría</div>
              <div className="rounded-full border border-zinc-800 px-3 py-1">Storage privado</div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</div>
              <button
                type="button"
                className="text-xs text-zinc-300 underline underline-offset-4 hover:text-white"
                onClick={() => setMode((m) => (m === 'login' ? 'signup' : 'login'))}
              >
                {mode === 'login' ? 'Crear cuenta' : 'Ya tengo cuenta'}
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <label className="block" htmlFor="email">
                <div className="text-xs text-zinc-300">Email</div>
                <input
                  id="email"
                  aria-label="Email"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-700"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="block" htmlFor="password">
                <div className="text-xs text-zinc-300">Contraseña</div>
                <input
                  id="password"
                  aria-label="Contraseña"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-700"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <div className="mt-2 text-[11px] leading-5 text-zinc-500">
                  Si la contraseña no funciona, el sistema puede enviarte un enlace mágico al email indicado para entrar directamente.
                </div>
              </label>

              {error ? (
                <div className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
                  {success}
                </div>
              ) : null}

              <button
                disabled={loading}
                className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
                type="submit"
              >
                {loading ? 'Procesando…' : mode === 'login' ? 'Entrar con email' : 'Enviar enlace mágico'}
              </button>
            </form>

            <div className="mt-4 text-xs text-zinc-400">
              Si es tu primera vez, crea cuenta y después asigna tu perfil/roles desde Admin.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

