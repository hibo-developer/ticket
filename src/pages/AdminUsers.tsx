import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { adminCreateUser } from '@/core/auth/adminCreateUser'
import { inviteUserToOrg } from '@/core/auth/invite'
import { supabase } from '@/core/auth/supabaseClient'
import { usePermissions } from '@/core/rbac/usePermissions'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type ProfileRow = {
  id: string
  full_name: string | null
  username: string | null
  app_role: string
  active: boolean
  created_at: string
}

type RoleRow = {
  id: string
  name: string
}

type Availability = { email_taken: boolean; username_taken: boolean }

function passwordError(value: string) {
  if (!value) return 'La contraseña temporal es obligatoria.'
  if (value.length < 10) return 'Mínimo 10 caracteres.'
  if (!/[a-z]/i.test(value)) return 'Debe incluir letras.'
  if (!/\d/.test(value)) return 'Debe incluir números.'
  return null
}

function usernameError(value: string) {
  const v = value.trim()
  if (!v) return null
  if (v.length < 3) return 'Mínimo 3 caracteres.'
  if (v.length > 32) return 'Máximo 32 caracteres.'
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) return 'Solo letras, números, punto, guion y guion bajo.'
  return null
}

export default function AdminUsers() {
  const { profile } = useAuth()
  const { permissions } = usePermissions()

  const canAdmin = permissions.has('admin.access')

  const [rows, setRows] = useState<ProfileRow[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')

  const [cEmail, setCEmail] = useState('')
  const [cFullName, setCFullName] = useState('')
  const [cUsername, setCUsername] = useState('')
  const [cPassword, setCPassword] = useState('')
  const [cAppRole, setCAppRole] = useState<'user' | 'admin'>('user')
  const [cRoleIds, setCRoleIds] = useState<Set<string>>(() => new Set())
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [checking, setChecking] = useState(false)

  const load = async () => {
    if (!profile?.org_id || !canAdmin) return
    setLoading(true)
    setError(null)

    const [pRes, rRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, username, app_role, active, created_at')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false }),
      supabase.from('roles').select('id, name').eq('org_id', profile.org_id).order('name', { ascending: true }),
    ])

    if (pRes.error || rRes.error) {
      setError((pRes.error ?? rRes.error)?.message ?? 'Error al cargar usuarios.')
      setLoading(false)
      return
    }

    setRows((pRes.data ?? []) as ProfileRow[])
    setRoles((rRes.data ?? []) as RoleRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [profile?.org_id, canAdmin])

  useEffect(() => {
    if (!profile?.org_id || !canAdmin) return

    const e = cEmail.trim()
    const u = cUsername.trim()

    if (!e && !u) {
      setAvailability(null)
      return
    }

    let cancelled = false
    setChecking(true)

    const t = setTimeout(async () => {
      try {
        const res = await supabase.rpc('admin_check_user_availability', { p_email: e || null, p_username: u || null })
        if (cancelled) return
        if (res.error) {
          setAvailability(null)
          return
        }
        setAvailability(res.data as Availability)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [cEmail, cUsername, profile?.org_id, canAdmin])

  const meId = profile?.id ?? ''
  const me = useMemo(() => rows.find((r) => r.id === meId) ?? null, [rows, meId])

  const doInvite = async () => {
    const e = email.trim()
    if (!e) return

    setBusy(true)
    setError(null)
    setInfo(null)

    try {
      await inviteUserToOrg({ email: e, full_name: fullName.trim() || undefined })
      setEmail('')
      setFullName('')
      setInfo('Invitación enviada.')
      await load()
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo invitar al usuario.')
    } finally {
      setBusy(false)
    }
  }

  const setActive = async (userId: string, active: boolean) => {
    if (!profile?.org_id) return
    setBusy(true)
    setError(null)
    setInfo(null)

    const res = await supabase.from('profiles').update({ active }).eq('id', userId)
    setBusy(false)

    if (res.error) {
      setError(res.error.message)
      return
    }

    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, active } : r)))
  }

  const setAppRole = async (userId: string, app_role: string) => {
    if (!profile?.org_id) return
    setBusy(true)
    setError(null)
    setInfo(null)

    const nextRole = app_role === 'admin' ? 'admin' : 'user'
    const res = await supabase.from('profiles').update({ app_role: nextRole }).eq('id', userId)
    setBusy(false)

    if (res.error) {
      setError(res.error.message)
      return
    }

    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, app_role: nextRole } : r)))
  }

  if (!canAdmin) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Acceso restringido</div>
        <div className="mt-2 text-sm text-zinc-600">No tienes permisos para acceder a Administración.</div>
      </div>
    )
  }

  if (loading) {
    return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">Cargando…</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">Administración</div>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Usuarios</h1>
          <div className="flex gap-2">
            <Link
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm leading-9 text-zinc-900 hover:bg-zinc-100"
              to="/admin"
            >
              Admin
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
      {info ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div> : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Invitar a mi empresa</div>
        <div className="mt-2 text-sm text-zinc-600">El usuario recibirá un email para acceder a la plataforma.</div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Nombre (opcional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Button type="button" onClick={doInvite} disabled={busy || !email.trim()}>
            Enviar invitación
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Crear usuario</div>
        <div className="mt-2 text-sm text-zinc-600">Crea un usuario con contraseña temporal y roles.</div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <Input placeholder="Nombre completo" value={cFullName} onChange={(e) => setCFullName(e.target.value)} />
          <Input placeholder="Email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
          <Input placeholder="Usuario (opcional)" value={cUsername} onChange={(e) => setCUsername(e.target.value)} />
          <Input placeholder="Contraseña temporal" type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} />
          <select
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
            value={cAppRole}
            onChange={(e) => setCAppRole(e.target.value === 'admin' ? 'admin' : 'user')}
          >
            <option value="user">app: user</option>
            <option value="admin">app: admin</option>
          </select>
        </div>

        <div className="mt-3 text-xs text-zinc-600">
          {checking ? 'Validando…' : availability?.email_taken ? 'Email ya existe.' : availability?.username_taken ? 'Usuario ya existe.' : null}
        </div>

        {usernameError(cUsername) ? <div className="mt-2 text-xs text-rose-700">{usernameError(cUsername)}</div> : null}
        {passwordError(cPassword) ? <div className="mt-2 text-xs text-rose-700">{passwordError(cPassword)}</div> : null}

        <div className="mt-4">
          <div className="text-xs font-medium text-zinc-700">Roles</div>
          <div className="mt-2 flex flex-col gap-2">
            {roles.length === 0 ? (
              <div className="text-xs text-zinc-500">No hay roles creados.</div>
            ) : (
              roles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={cRoleIds.has(r.id)}
                    onChange={(e) =>
                      setCRoleIds((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(r.id)
                        else next.delete(r.id)
                        return next
                      })
                    }
                  />
                  {r.name}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="mt-4">
          <Button
            type="button"
            disabled={
              busy ||
              !cEmail.trim() ||
              Boolean(passwordError(cPassword)) ||
              Boolean(usernameError(cUsername)) ||
              Boolean(availability?.email_taken) ||
              Boolean(cUsername.trim() && availability?.username_taken)
            }
            onClick={async () => {
              if (!profile?.org_id) return
              setBusy(true)
              setError(null)
              setInfo(null)
              try {
                await adminCreateUser({
                  email: cEmail.trim(),
                  full_name: cFullName.trim() || undefined,
                  username: cUsername.trim() || undefined,
                  temp_password: cPassword,
                  app_role: cAppRole,
                  role_ids: Array.from(cRoleIds),
                })
                setCEmail('')
                setCFullName('')
                setCUsername('')
                setCPassword('')
                setCAppRole('user')
                setCRoleIds(new Set())
                setInfo('Usuario creado.')
                await load()
              } catch (e: any) {
                setError(e?.message ?? 'No se pudo crear el usuario.')
              } finally {
                setBusy(false)
              }
            }}
          >
            Crear usuario
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Mi empresa</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="[&>th]:px-3 [&>th]:py-2">
                <th>Usuario</th>
                <th>Username</th>
                <th>Rol app</th>
                <th>Activo</th>
                <th>Alta</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={6}>
                    Sin usuarios.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3 text-zinc-900">{r.full_name || r.id.slice(0, 8)}</td>
                    <td className="px-3 py-3 text-zinc-600">{r.username ?? '—'}</td>
                    <td className="px-3 py-3">
                      <select
                        className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300 disabled:opacity-60"
                        disabled={busy || r.id === meId}
                        value={r.app_role}
                        onChange={(e) => setAppRole(r.id, e.target.value)}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{r.active ? 'Sí' : 'No'}</td>
                    <td className="px-3 py-3 text-zinc-600">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <button
                        className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
                        disabled={busy || (r.id === meId && me?.active)}
                        onClick={() => setActive(r.id, !r.active)}
                      >
                        {r.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
