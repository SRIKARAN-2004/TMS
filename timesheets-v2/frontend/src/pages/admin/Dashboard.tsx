import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { adminApi } from '../../api/roles'
import { Roles } from '../../lib/roles'
import { Icon } from '../../components/icons'
import GreetingBanner from '../../components/GreetingBanner'

const STATUS_LABEL: Record<string, string> = {
  created: 'Planning',
  in_progress: 'Active',
  completed: 'Completed',
  archived: 'On Hold',
}
const STATUS_COLORS: Record<string, string> = {
  created: 'bg-blue-50 text-blue-600',
  in_progress: 'bg-emerald-50 text-emerald-600',
  completed: 'bg-slate-100 text-slate-500',
  archived: 'bg-amber-50 text-amber-600',
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([adminApi.listUsers(), adminApi.listProjects(), adminApi.listTasks(), adminApi.listAllTimeLogs()])
      .then(([u, p, t, l]) => {
        setUsers(u)
        setProjects(p)
        setTasks(t)
        setLogs(l)
      })
      .finally(() => setLoading(false))
  }, [])

  const managerCount = users.filter((u) => u.roles.includes(Roles.MANAGER)).length
  const employeeCount = users.filter((u) => u.roles.includes(Roles.EMPLOYEE) && !u.roles.includes(Roles.MANAGER) && !u.roles.includes(Roles.ADMIN)).length

  const cards = [
    { label: 'Total Users', value: users.length, icon: Icon.User, bg: 'bg-blue-50', fg: 'text-blue-500' },
    { label: 'Total Managers', value: managerCount, icon: Icon.Shield, bg: 'bg-purple-50', fg: 'text-purple-500' },
    { label: 'Total Employees', value: employeeCount, icon: Icon.User, bg: 'bg-emerald-50', fg: 'text-emerald-500' },
    { label: 'Total Projects', value: projects.length, icon: Icon.Folder, bg: 'bg-amber-50', fg: 'text-amber-500' },
    { label: 'Total Tasks', value: tasks.length, icon: Icon.CheckSquare, bg: 'bg-sky-50', fg: 'text-sky-500' },
    { label: 'Total Time Logs', value: logs.length, icon: Icon.Clock, bg: 'bg-red-50', fg: 'text-red-500' },
  ]

  const recentProjects = [...projects].slice(0, 5)
  const recentLogs = [...logs].slice(0, 5)

  return (
    <div>
      <GreetingBanner name={user?.name} subtitle="Here's what's happening today" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className={`w-9 h-9 rounded-lg ${c.bg} ${c.fg} flex items-center justify-center mb-3`}>
              <span className="nav-icon" style={{ width: 18, height: 18 }}><c.icon /></span>
            </div>
            <div className="text-2xl font-display font-bold text-ink">{loading ? '—' : c.value}</div>
            <div className="text-xs text-muted mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">Recent Projects</div>
          <table className="w-full text-sm">
            <thead className="th-row">
              <tr className="text-left border-b border-border">
                <th className="px-5 py-2">Project Name</th>
                <th className="px-5 py-2">Start Date</th>
                <th className="px-5 py-2">End Date</th>
                <th className="px-5 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentProjects.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-5 py-3 text-slate-600">{p.start_date || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{p.end_date || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${STATUS_COLORS[p.status] || ''}`}>{STATUS_LABEL[p.status] || p.status}</span>
                  </td>
                </tr>
              ))}
              {!loading && recentProjects.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-muted">No projects yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">Recent Time Logs</div>
          <table className="w-full text-sm">
            <thead className="th-row">
              <tr className="text-left border-b border-border">
                <th className="px-5 py-2">Employee</th>
                <th className="px-5 py-2">Project</th>
                <th className="px-5 py-2">Task</th>
                <th className="px-5 py-2">Hours</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((l) => {
                const hrs = ((new Date(l.end_time).getTime() - new Date(l.start_time).getTime()) / 1000 / 60 / 60).toFixed(1)
                return (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">{l.user_name}</td>
                    <td className="px-5 py-3 text-slate-600">{l.project_name}</td>
                    <td className="px-5 py-3 text-slate-600">{l.task_name}</td>
                    <td className="px-5 py-3"><span className="badge bg-blue-50 text-blue-600">{hrs}h</span></td>
                  </tr>
                )
              })}
              {!loading && recentLogs.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-muted">No time logs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
