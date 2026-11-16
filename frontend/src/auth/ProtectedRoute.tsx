import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthState'

export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'initializing') {
    return <div className="route-loading" role="status">Restoring your session…</div>
  }

  if (status === 'anonymous') {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { status } = useAuth()

  if (status === 'initializing') {
    return <div className="route-loading" role="status">Restoring your session…</div>
  }

  if (status === 'authenticated') {
    return <Navigate to="/applications" replace />
  }

  return <Outlet />
}
