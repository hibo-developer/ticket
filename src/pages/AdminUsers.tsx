import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { adminCreateUser } from '@/core/auth/adminCreateUser'
import { inviteUserToOrg } from '@/core/auth/invite'
import { supabase } from '@/core/auth/supabaseClient'
import { invalidatePermissions } from '@/core/rbac/permissionsInvalidate'
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

type UserRoleRow = {
  user_id: string
  role_id: string
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
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([])
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

  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingRoleIds, setEditingRoleIds] = useState<Set<string>>(() => new Set())

  const load = async () => {
    if (!profile?.org_id || !canAdmin) return
    setLoading(true)
    setError(null)

    const [pRes, rRes, urRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, username, app_role, active, created_at')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false }),
      supabase.from('roles').select('id, name').eq('org_id', profile.org_id).order('name', { ascending: true }),
      supabase
        .from('user_roles')
        .select('user_id, role_id, roles!inner(id, org_id)')
        .eq('roles.org_id', profile.org_id),
    ])

    if (pRes.error || rRes.error || urRes.error) {
      setError((pRes.error ?? rRes.error ?? urRes.error)?.message ?? 'Error al cargar usuarios.')
      setLoading(false)
      return
    }

    setRows((pRes.data ?? []) as ProfileRow[])
    setRoles((rRes.data ?? []) as RoleRow[])
    setUserRoles(((urRes.data ?? []) as any[]).map((r) => ({ user_id: r.user_id, role_id: r.role_id })) as UserRoleRow[])
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

  const rolesByUserId = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const ur of userRoles) {
      const s = map.get(ur.user_id) ?? new Set<string>()
      s.add(ur.role_id)
      map.set(ur.user_id, s)
    }
    return map
  }, [userRoles])

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of roles) map.set(r.id, r.name)
    return map
  }, [roles])

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
    if (userId === meId) invalidatePermissions()
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
    if (userId === meId) invalidatePermissions()
  }

  const startEditRoles = async (userId: string) => {
    const current = rolesByUserId.get(userId) ?? new Set<string>()
    setEditingRoleIds(new Set(current))
    setEditingUserId(userId)
  }

  const cancelEditRoles = () => {
    setEditingUserId(null)
    setEditingRoleIds(new Set())
  }

  const saveUserRoles = async () => {
    const userId = editingUserId
    if (!userId || !profile?.org_id) return
    setBusy(true)
    setError(null)
    setInfo(null)

    try {
      const roleIdsOrg = new Set(roles.map((r) => r.id))
      const previous = rolesByUserId.get(userId) ?? new Set<string>()
      const nextRaw = new Set(editingRoleIds)
      const nextIds = new Set<string>()
      for (const rid of nextRaw) if (roleIdsOrg.has(rid)) nextIds.add(rid)

      const toRemove = new Set<string>()
      for (const rid of previous) if (roleIdsOrg.has(rid) && !nextIds.has(rid)) toRemove.add(rid)
      const toAdd = new Set<string>()
      for (const rid of nextIds) if (!previous.has(rid)) toAdd.add(rid)

      if (toRemove.size > 0) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .in('role_id', Array.from(toRemove))
        if (error) throw error
      }

      if (toAdd.size > 0) {
        const rowsToInsert = Array.from(toAdd).map((role_id) => ({ user_id: userId, role_id }))
        const { error } = await supabase.from('user_roles').insert(rowsToInsert)
        if (error) throw error
      }

      const nextUserRoles = userRoles.filter((ur) => ur.user_id !== userId).concat(
        Array.from(nextIds).map((role_id) => ({ user_id: userId, role_id })),
      )
      setUserRoles(nextUserRoles)
      setInfo('Roles actualizados.')
      if (userId === meId) invalidatePermissions()
      cancelEditRoles()
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar los roles del usuario.')
    } finally {
      setBusy(false)
    }
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
                <th>Roles asignados</th>
                <th>Activo</th>
                <th>Alta</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={7}>
                    Sin usuarios.
                  </td>
                </tr>
              ) : (
                rows.flatMap((r) => {
                  const isEditing = editingUserId === r.id
                  const roleIds = rolesByUserId.get(r.id) ?? new Set<string>()
                  const roleNames = Array.from(roleIds)
                    .map((id) => roleNameById.get(id))
                    .filter((v): v is string => Boolean(v))
                  const rowsOut = [
                    <tr key={r.id} className="hover:bg-zinc-50 align-top">
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
                      <td className="px-3 py-3 text-zinc-700">
                        {roleNames.length === 0 ? (
                          <span className="text-zinc-500">Sin roles</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {roleNames.map((n) => (
                              <span
                                key={n}
                                className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-800"
                              >
                                {n}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-zinc-600">{r.active ? 'Sí' : 'No'}</td>
                      <td className="px-3 py-3 text-zinc-600">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-3 py-3 text-right align-top">
                        <div className="flex flex-col items-end gap-1">
                          {isEditing ? null : (
                            <button
                              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
                              disabled={busy}
                              onClick={() => startEditRoles(r.id)}
                            >
                              Editar roles
                            </button>
                          )}
                          <button
                            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
                            disabled={busy || (r.id === meId && me?.active)}
                            onClick={() => setActive(r.id, !r.active)}
                          >
                            {r.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>,
                  ]
                  if (isEditing) {
                    rowsOut.push(
                      <tr key={`${r.id}-edit`} className="bg-zinc-50">
                        <td className="px-3 py-3" colSpan={7}>
                          <div className="rounded-xl border border-zinc-200 bg-white p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div className="text-sm font-medium text-zinc-900">
                                Roles para <span className="text-zinc-600">{r.full_name ?? r.id.slice(0, 8)}</span>
                              </div>
                              <div className="flex gap-2">
                                <Button type="button" variant="ghost" onClick={cancelEditRoles} disabled={busy}>
                                  Cancelar
                                </Button>
                                <Button type="button" onClick={saveUserRoles} disabled={busy}>
                                  {busy ? 'Guardando…' : 'Guardar'}
                                </Button>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                              {roles.length === 0 ? (
                                <div className="text-sm text-zinc-500">No hay roles creados. Ve a Admin → Roles y permisos para crearlos.</div>
                              ) : (
                                roles.map((ro) => (
                                  <label
                                    key={ro.id}
                                    className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={busy}
                                      checked={editingRoleIds.has(ro.id)}
                                      onChange={(e) =>
                                        setEditingRoleIds((prev) => {
                                          const next = new Set(prev)
                                          if (e.target.checked) next.add(ro.id)
                                          else next.delete(ro.id)
                                          return next
                                        })
                                      }
                                    />
                                    {ro.name}
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>,
                    )
                  }
                  return rowsOut
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
