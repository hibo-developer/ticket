import { useAuth } from '@/core/auth/AuthContext'
import { Navigate } from 'react-router-dom'

export function RequireProfile({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/setup" replace />
  if (!profile.active) return null
  return <>{children}</>
}

