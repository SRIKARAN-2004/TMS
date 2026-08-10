import { useEffect, useState } from 'react'
import { adminApi } from '../../api/roles'
import { Icon } from '../../components/icons'

const ROLE_META: Record<string, { label: string; icon: (p: any) => JSX.Element; iconBg: string; iconFg: string; badge: string }> = {
  admin: { label: 'Admin', icon: Icon.Shield, iconBg: 'bg-red-50', iconFg: 'text-red-500', badge: 'bg-red-50 text-red-500' },
  manager: { label: 'Manager', icon: Icon.Briefcase, iconBg: 'bg-purple-50', iconFg: 'text-purple-500', badge: 'bg-purple-50 text-purple-600' },
  employee: { label: 'Employee', icon: Icon.User, iconBg: 'bg-blue-50', iconFg: 'text-blue-500', badge: 'bg-blue-50 text-blue-600' },
}

const AVATAR_COLORS = ['bg-red-100 text-red-600', 'bg-purple-100 text-purple-600', 'bg-blue-100 text-blue-600', 'bg-emerald-100 text-emerald-600']

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

export default function AdminRoles() {
  const [roles, setRoles] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([adminApi.listRoles(), adminApi.listUsers()])
      .then(([r, u]) => {
        setRoles(r)
        setUsers(u)
      })
      .finally(() => setLoading(false))
  }, [])

  function usersInRole(roleName: string) {
    return users.filter((u) => u.roles.includes(roleName))
  }

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-ink">Roles</h1>
      <p className="text-sm text-muted mt-1 mb-6">System roles define access permissions for all users.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {loading && <p className="text-muted text-sm col-span-3">Loading…</p>}
        {!loading &&
          roles.map((r, idx) => {
            const meta = ROLE_META[r.role] || { label: r.role, icon: Icon.Shield, iconBg: 'bg-slate-50', iconFg: 'text-slate-500', badge: 'bg-slate-50 text-slate-600' }
            const members = usersInRole(r.role)
            return (
              <div key={r.id} className="card p-5">
                <div className={`w-11 h-11 rounded-xl ${meta.iconBg} ${meta.iconFg} flex items-center justify-center mb-4`}>
                  <span className="nav-icon" style={{ width: 22, height: 22 }}><meta.icon /></span>
                </div>
                <h3 className="font-display font-bold text-lg text-ink capitalize">{meta.label}</h3>
                <p className="text-xs text-muted mb-4">Role ID: R{String(r.id).padStart(3, '0')}</p>
                <div className="border-t border-border pt-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">Users in this role</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {members.map((m, i) => (
                      <span
                        key={m.id}
                        className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs font-medium ${
                          m.isAlive ? AVATAR_COLORS[i % AVATAR_COLORS.length] : 'bg-slate-100 text-slate-400 line-through'
                        }`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white/60 flex items-center justify-center text-[10px] font-bold">
                          {initials(m.name)}
                        </span>
                        {m.name}
                        {!m.isAlive && <span className="text-[9px] not-italic no-underline ml-0.5">(inactive)</span>}
                      </span>
                    ))}
                    {members.length === 0 && <span className="text-xs text-muted">No users yet</span>}
                  </div>
                  <div className="text-sm font-semibold text-ink">
                    {members.length} <span className="font-normal text-muted">total</span>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">All Roles</div>
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Role ID</th>
              <th className="px-5 py-3">Role Name</th>
              <th className="px-5 py-3">Total Users</th>
              <th className="px-5 py-3">Active Users</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const members = usersInRole(r.role)
              const active = members.filter((m) => m.isAlive).length
              const meta = ROLE_META[r.role] || { badge: 'bg-slate-50 text-slate-600', label: r.role }
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-500 font-mono text-xs">R{String(r.id).padStart(3, '0')}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${meta.badge} capitalize`}>{meta.label}</span>
                  </td>
                  <td className="px-5 py-3 font-medium text-ink">{members.length}</td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-emerald-600">{active}</span>
                    <span className="text-muted"> / {members.length}</span>
                  </td>
                </tr>
              )
            })}
            {roles.length === 0 && !loading && (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-muted">No roles seeded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
