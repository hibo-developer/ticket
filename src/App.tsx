import { AppShell } from '@/core/layout/AppShell'
import { allModuleIds, allModules } from '@/core/modules/registry'
import { useEnabledModules } from '@/core/modules/useEnabledModules'
import { Permission } from '@/core/rbac/permissions'
import { RequirePermissions } from '@/core/routing/RequirePermissions'
import { RequireProfile } from '@/core/routing/RequireProfile'
import Admin from '@/pages/Admin'
import AdminTicketRecovery from '@/pages/AdminTicketRecovery'
import AdminUsers from '@/pages/AdminUsers'
import AdminViews from '@/pages/AdminViews'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'
import Setup from '@/pages/Setup'
import { BrowserRouter as Router, Outlet, useRoutes } from 'react-router-dom'

export default function App() {
  return (
    <Router>
      <AppRouter />
    </Router>
  )
}

function AppRouter() {
  const { loading, enabled } = useEnabledModules(allModuleIds)

  const active = loading ? new Set(allModuleIds) : enabled

  const moduleRoutes = allModules
    .filter((m) => active.has(m.id))
    .flatMap((m) => m.routes)

  return useRoutes([
    { path: 'login', element: <Login /> },
    { path: 'setup', element: <Setup /> },
    {
      path: '/',
      element: (
        <RequireProfile>
          <AppShell>
            <Outlet />
          </AppShell>
        </RequireProfile>
      ),
      children: [
        { index: true, element: <Dashboard /> },
        {
          path: 'admin',
          element: (
            <RequirePermissions required={[Permission.AdminAccess]}>
              <Admin />
            </RequirePermissions>
          ),
        },
        {
          path: 'admin/vistas',
          element: (
            <RequirePermissions required={[Permission.ViewsManage]}>
              <AdminViews />
            </RequirePermissions>
          ),
        },
        {
          path: 'admin/recuperacion',
          element: (
            <RequirePermissions required={[Permission.AdminAccess]}>
              <AdminTicketRecovery />
            </RequirePermissions>
          ),
        },
        {
          path: 'admin/usuarios',
          element: (
            <RequirePermissions required={[Permission.AdminAccess]}>
              <AdminUsers />
            </RequirePermissions>
          ),
        },
        ...moduleRoutes.map((r) => ({
          path: r.path.startsWith('/') ? r.path.slice(1) : r.path,
          element: (
            <RequirePermissions required={r.requiredPermissions}>
              <r.Component />
            </RequirePermissions>
          ),
        })),
        { path: '*', element: <NotFound /> },
      ],
    },
    { path: '*', element: <NotFound /> },
  ])
}
