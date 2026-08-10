import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Role } from '../lib/roles'

interface ProtectedRouteProps {
  allowedRoles?: Role[]
}

/**
 * Wraps a set of routes. If there's no logged-in user, redirect to /login.
 * If allowedRoles is given and the user doesn't have one of those roles,
 * this does a full page reload back to /login (via window.location, not a
 * client-side React Router navigation) - so someone manually typing a URL
 * for a page they can't access doesn't just get silently swapped to a
 * different page while staying "logged in" to the app shell; they're
 * bounced out entirely and have to log back in.
 */
export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, loading, hasRole } = useAuth()

  const unauthorized = !loading && !!user && !!allowedRoles && !hasRole(...allowedRoles)

  useEffect(() => {
    if (unauthorized) {
      window.location.href = '/login'
    }
  }, [unauthorized])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page text-muted">
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (unauthorized) {
    // The useEffect above is already redirecting via a full page reload;
    // render nothing in the meantime rather than flashing the wrong page.
    return null
  }

  return <Outlet />
}
