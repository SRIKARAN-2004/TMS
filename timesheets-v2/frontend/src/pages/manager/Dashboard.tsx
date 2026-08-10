import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { managerApi } from '../../api/roles'
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

export default function ManagerDashboard() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([managerApi.listProjects(), managerApi.listTasks(), managerApi.teamTimeLogs()])
      .then(([p, t, l]) => {
        setProjects(p)
        setTasks(t)
        setLogs(l)
      })
      .finally(() => setLoading(false))
  }, [])

  const todayStr = new Date().toDateString()
  const todaysLogs = logs.filter((l) => new Date(l.start_time).toDateString() === todayStr)
  const pendingLogs = logs.filter((l) => l.status === 'pending')

  const cards = [
    { label: 'My Projects', value: projects.length, icon: Icon.Folder, bg: 'bg-blue-50', fg: 'text-blue-500' },
    { label: 'Total Tasks', value: tasks.length, icon: Icon.CheckSquare, bg: 'bg-purple-50', fg: 'text-purple-500' },
    { label: "Today's Time Logs", value: todaysLogs.length, icon: Icon.Clock, bg: 'bg-emerald-50', fg: 'text-emerald-500' },
    { label: 'Pending Time Logs', value: pendingLogs.length, icon: Icon.AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-500' },
  ]

  const recentProjects = [...projects].slice(0, 5)
  const recentLogs = [...logs].slice(0, 5)

  return (
    <div>
      <GreetingBanner name={user?.name} subtitle="Here's a summary of your team's activity" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
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
          <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">My Projects</div>
          <table className="w-full text-sm">
            <thead className="th-row">
              <tr className="text-left border-b border-border">
                <th className="px-5 py-2">Project</th>
                <th className="px-5 py-2">End Date</th>
                <th className="px-5 py-2">Status</th>
                <th className="px-5 py-2">Team</th>
              </tr>
            </thead>
            <tbody>
              {recentProjects.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-5 py-3 text-slate-600">{p.end_date || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${STATUS_COLORS[p.status] || ''}`}>{STATUS_LABEL[p.status] || p.status}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{p.team_count} member{p.team_count === 1 ? '' : 's'}</td>
                </tr>
              ))}
              {!loading && recentProjects.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-muted">No projects yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">Recent Team Time Logs</div>
          <table className="w-full text-sm">
            <thead className="th-row">
              <tr className="text-left border-b border-border">
                <th className="px-5 py-2">Employee</th>
                <th className="px-5 py-2">Project</th>
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
                    <td className="px-5 py-3"><span className="badge bg-blue-50 text-blue-600">{hrs}h</span></td>
                  </tr>
                )
              })}
              {!loading && recentLogs.length === 0 && (
                <tr><td colSpan={3} className="px-5 py-6 text-center text-muted">No time logs from your team yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
