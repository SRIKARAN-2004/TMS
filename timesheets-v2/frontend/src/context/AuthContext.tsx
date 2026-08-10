import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { login as loginApi, logout as logoutApi, fetchMe } from '../api/auth'
import { Roles, Role } from '../lib/roles'
import ChangePasswordModal from '../components/ChangePasswordModal'

interface AuthUser {
  id: number
  userid: string
  name: string
  roles: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
  primaryRole: () => Role | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  // Backend-enforced flag (see must_change_password on the Passwords
  // table) - previously fetched but silently dropped here, so nothing in
  // the UI ever actually forced the rotation the backend intended.
  const [mustChangePassword, setMustChangePassword] = useState(false)

  useEffect(() => {
    // The auth token lives in an httpOnly cookie now, not localStorage - so
    // the only way to know if there's an existing session is to ask the
    // backend. If the cookie is missing/expired, this 401s and we just
    // treat that as "not logged in" rather than an error to surface.
    fetchMe()
      .then((me) => {
        setUser({ id: me.id, userid: me.userid, name: me.name, roles: me.roles })
        setMustChangePassword(Boolean(me.must_change_password))
      })
      .catch(() => {
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(username: string, password: string) {
    const res = await loginApi(username, password)
    // The cookie is set automatically by the browser from the login
    // response's Set-Cookie header - nothing to store here manually.
    const authUser: AuthUser = {
      id: res.user_id,
      userid: res.userid,
      name: res.name,
      roles: res.roles,
    }
    setUser(authUser)
    setMustChangePassword(Boolean(res.must_change_password))
    return authUser
  }

  async function logout() {
    try {
      await logoutApi()
    } finally {
      setUser(null)
      window.location.href = '/login'
    }
  }

  function hasRole(...roles: Role[]) {
    if (!user) return false
    return roles.some((r) => user.roles.includes(r))
  }

  function primaryRole(): Role | null {
    if (!user) return null
    if (user.roles.includes(Roles.ADMIN)) return Roles.ADMIN
    if (user.roles.includes(Roles.MANAGER)) return Roles.MANAGER
    if (user.roles.includes(Roles.EMPLOYEE)) return Roles.EMPLOYEE
    return null
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, primaryRole }}>
      {children}
      {/* Blocking gate: rendered on top of whatever route the user landed
       * on so it can't be routed/refreshed around. Only reachable once
       * `user` is set, so it never flashes on the login page itself. */}
      {user && mustChangePassword && (
        <ChangePasswordModal
          open
          forced
          onClose={() => {}}
          onSuccess={() => setMustChangePassword(false)}
        />
      )}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
