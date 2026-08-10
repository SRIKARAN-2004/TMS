import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { employeeApi } from '../../api/roles'
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

export default function EmployeeDashboard() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([employeeApi.myProjects(), employeeApi.myTimeLogs()])
      .then(([p, l]) => {
        setProjects(p)
        setLogs(l)
      })
      .finally(() => setLoading(false))
  }, [])

  function hoursBetween(a: string, b: string) {
    return (new Date(b).getTime() - new Date(a).getTime()) / 1000 / 60 / 60
  }

  // Both "today" and "this week" are built from the SAME local-midnight
  // boundary and the SAME inclusive/exclusive comparison (>= start, < end),
  // so "this week" is guaranteed to be a superset of "today" - if every log
  // this week happened today, the two cards will show the same number.
  //
  // "This week" previously used a rolling `now - 7 days` window instead of
  // a calendar week, which used a different (and inconsistent, `>` instead
  // of `>=`) boundary than "today" - that mismatch is what caused the two
  // cards to disagree. Now both are anchored to the same startOfToday and
  // walk outward from there using identical logic.
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000

  // Calendar week starting Monday (ISO-style). getDay() is 0=Sun..6=Sat,
  // so this converts that into "days since this week's Monday".
  const dayOfWeek = now.getDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const startOfWeek = startOfToday - daysSinceMonday * 24 * 60 * 60 * 1000
  const endOfWeek = startOfWeek + 7 * 24 * 60 * 60 * 1000

  const todayHours = logs
    .filter((l) => {
      const t = new Date(l.start_time).getTime()
      return t >= startOfToday && t < endOfToday
    })
    .reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)

  // "This week" logs, computed once and then split by the server-assigned
  // `type` field (standard vs overtime - see backend's _compute_type) so
  // the standard/overtime cards and the week total are always derived
  // from the exact same set of logs and can never drift apart or double
  // count. Every time `logs` is refreshed (e.g. after logging new time
  // and navigating back to this page), all three figures below are
  // recomputed from scratch off the full log list, so the week's running
  // total keeps accumulating correctly log by log rather than resetting.
  const thisWeekLogs = logs.filter((l) => {
    const t = new Date(l.start_time).getTime()
    return t >= startOfWeek && t < endOfWeek
  })

  const weekHours = thisWeekLogs.reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)
  const standardWeekHours = thisWeekLogs
    .filter((l) => l.type === 'standard')
    .reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)
  const overtimeWeekHours = thisWeekLogs
    .filter((l) => l.type === 'overtime')
    .reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)

  const cards = [
    { label: 'Assigned Projects', value: projects.length, icon: Icon.Folder, bg: 'bg-blue-50', fg: 'text-blue-500' },
    { label: "Today's Hours", value: `${todayHours.toFixed(1)}h`, icon: Icon.Clock, bg: 'bg-emerald-50', fg: 'text-emerald-500' },
    { label: "This Week's Hours", value: `${weekHours.toFixed(1)}h`, icon: Icon.Calendar, bg: 'bg-purple-50', fg: 'text-purple-500' },
    { label: 'Standard Hours (Week)', value: `${standardWeekHours.toFixed(1)}h`, icon: Icon.Check, bg: 'bg-[#E9F1EF]', fg: 'text-teal' },
    { label: 'Overtime Hours (Week)', value: `${overtimeWeekHours.toFixed(1)}h`, icon: Icon.Zap, bg: 'bg-amber-50', fg: 'text-amber-600' },
  ]

  const recentProjects = [...projects].slice(0, 5)
  const recentLogs = [...logs].slice(0, 5)

  return (
    <div>
      <GreetingBanner name={user?.name} subtitle="Here's your work summary" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className={`w-9 h-9 rounded-lg ${c.bg} ${c.fg} flex items-center justify-center mb-3`}>
              <span className="nav-icon" style={{ width: 18, height: 18 }}><c.icon /></span>
            </div>
            <div className="text-2xl figures font-bold text-ink">{loading ? '—' : c.value}</div>
            <div className="text-xs text-muted mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">My Assigned Projects</div>
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
              <tr><td colSpan={4} className="px-5 py-6 text-center text-muted">You're not assigned to any projects yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">My Recent Time Logs</div>
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-2">Date</th>
              <th className="px-5 py-2">Project</th>
              <th className="px-5 py-2">Task</th>
              <th className="px-5 py-2">Hours</th>
              <th className="px-5 py-2">Type</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 text-slate-600">{new Date(l.start_time).toLocaleDateString()}</td>
                <td className="px-5 py-3 font-medium text-ink">{l.project_name}</td>
                <td className="px-5 py-3 text-slate-600">{l.task_name}</td>
                <td className="px-5 py-3"><span className="badge bg-blue-50 text-blue-600">{hoursBetween(l.start_time, l.end_time).toFixed(1)}h</span></td>
                <td className="px-5 py-3">
                  <span className={`badge ${l.type === 'overtime' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{l.type}</span>
                </td>
              </tr>
            ))}
            {!loading && recentLogs.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-muted">No time logs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
