import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import PercentCircle from '../../components/PercentCircle'
import { managerApi } from '../../api/roles'
import { exportToCsv } from '../../lib/export'
import { Icon } from '../../components/icons'

function hoursBetween(start: string, end: string) {
  return (new Date(end).getTime() - new Date(start).getTime()) / 1000 / 60 / 60
}

export default function ManagerReports() {
  const [logs, setLogs] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [filterProject, setFilterProject] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [contributionSort, setContributionSort] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    Promise.all([managerApi.teamTimeLogs(), managerApi.listProjects()])
      .then(([l, p]) => {
        setLogs(l)
        setProjects(p)
      })
      .finally(() => setLoading(false))
  }, [])

  const employees = useMemo(() => {
    const map = new Map<number, string>()
    logs.forEach((l) => map.set(l.user_id, l.user_name))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [logs])

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterProject && String(l.project_id) !== filterProject) return false
      if (filterEmployee && String(l.user_id) !== filterEmployee) return false
      if (filterType && l.type !== filterType) return false
      if (filterFrom && new Date(l.start_time) < new Date(filterFrom)) return false
      if (filterTo && new Date(l.start_time) > new Date(filterTo + 'T23:59:59')) return false
      return true
    })
  }, [logs, filterProject, filterEmployee, filterType, filterFrom, filterTo])

  const totalHours = filteredLogs.reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)
  const overtimeHours = filteredLogs.filter((l) => l.type === 'overtime').reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)

  const projectStatusById = useMemo(() => {
    const map = new Map<number, string>()
    projects.forEach((p) => map.set(p.id, p.status))
    return map
  }, [projects])

  const effectiveness = useMemo(() => {
    const byUser = new Map<number, { name: string; managerName: string; total: number; onActiveProjects: number; standard: number }>()
    filteredLogs.forEach((l) => {
      const hrs = hoursBetween(l.start_time, l.end_time)
      const entry = byUser.get(l.user_id) || {
        name: l.user_name,
        // Each log already carries the manager that person actually
        // reported to for that entry (see backend TimeLogOut.manager_name) -
        // used directly here rather than re-derived on the client, so this
        // table can never drift from what Admin's Reports page shows for
        // the same person.
        managerName: l.manager_name || 'Unassigned',
        total: 0,
        onActiveProjects: 0,
        standard: 0,
      }
      entry.total += hrs
      const status = projectStatusById.get(l.project_id)
      if (status === 'in_progress' || status === 'completed') entry.onActiveProjects += hrs
      if (l.type === 'standard') entry.standard += hrs
      byUser.set(l.user_id, entry)
    })
    return Array.from(byUser.entries())
      .map(([userId, e]) => ({
        userId,
        name: e.name,
        managerName: e.managerName,
        totalHours: e.total,
        projectEffectiveness: e.total > 0 ? (e.onActiveProjects / e.total) * 100 : 0,
        activityEffectiveness: e.total > 0 ? (e.standard / e.total) * 100 : 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours)
  }, [filteredLogs, projectStatusById])

  // Contribution % = (employee's hours on a project / total hours logged
  // for that project) x 100 - same calculation as Admin Reports. This was
  // previously only on the Admin page even though managers have the same
  // per-project data (teamTimeLogs) to compute it from; there's no reason
  // a manager shouldn't see how their team's hours split across a shared
  // project.
  const contributions = useMemo(() => {
    const byProjectUser = new Map<string, { projectName: string; userName: string; hours: number }>()
    const totalByProject = new Map<number, number>()

    filteredLogs.forEach((l) => {
      const hrs = hoursBetween(l.start_time, l.end_time)
      totalByProject.set(l.project_id, (totalByProject.get(l.project_id) || 0) + hrs)
      const key = `${l.project_id}-${l.user_id}`
      const entry = byProjectUser.get(key) || { projectName: l.project_name, userName: l.user_name, hours: 0 }
      entry.hours += hrs
      byProjectUser.set(key, entry)
    })

    const rows = Array.from(byProjectUser.entries()).map(([key, e]) => {
      const projectId = Number(key.split('-')[0])
      const totalForProject = totalByProject.get(projectId) || 0
      return {
        key,
        projectName: e.projectName,
        userName: e.userName,
        hours: e.hours,
        contributionPercent: totalForProject > 0 ? (e.hours / totalForProject) * 100 : 0,
      }
    })

    rows.sort((a, b) =>
      contributionSort === 'asc'
        ? a.projectName.localeCompare(b.projectName)
        : b.projectName.localeCompare(a.projectName)
    )
    return rows
  }, [filteredLogs, contributionSort])

  function clearFilters() {
    setFilterProject('')
    setFilterEmployee('')
    setFilterType('')
    setFilterFrom('')
    setFilterTo('')
  }

  function handleExport() {
    exportToCsv('team-report', filteredLogs.map((l) => ({
      Employee: l.user_name,
      Manager: l.manager_name || 'Unassigned',
      Project: l.project_name,
      Task: l.task_name,
      'Start Time': l.start_time,
      'End Time': l.end_time,
      Hours: hoursBetween(l.start_time, l.end_time).toFixed(1),
      Type: l.type,
      Comments: l.comments || '',
    })))
  }

  const hasFilters = filterProject || filterEmployee || filterType || filterFrom || filterTo

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Your team's hours - filter by project, employee, type, or date range"
        action={
          <button className="btn-primary" onClick={handleExport} disabled={loading || filteredLogs.length === 0}>
            <span className="nav-icon" style={{ width: 14, height: 14 }}><Icon.Download /></span> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-2xl font-display font-bold text-ink">{loading ? '—' : totalHours.toFixed(1)}h</div>
          <div className="text-xs text-muted mt-1">Total Hours (filtered)</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-display font-bold text-amber-600">{loading ? '—' : overtimeHours.toFixed(1)}h</div>
          <div className="text-xs text-muted mt-1">Overtime Hours</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-display font-bold text-ink">{loading ? '—' : projects.length}</div>
          <div className="text-xs text-muted mt-1">My Projects</div>
        </div>
      </div>

      <div className="card p-4 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label htmlFor="reports-project" className="text-xs text-muted mb-1 block">Project</label>
            <select id="reports-project" className="input" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="reports-employee" className="text-xs text-muted mb-1 block">Employee</label>
            <select id="reports-employee" className="input" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="reports-type" className="text-xs text-muted mb-1 block">Type</label>
            <select id="reports-type" className="input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              <option value="standard">Standard</option>
              <option value="overtime">Overtime</option>
            </select>
          </div>
          <div>
            <label htmlFor="reports-from" className="text-xs text-muted mb-1 block">From</label>
            <input id="reports-from" type="date" className="input" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reports-to" className="text-xs text-muted mb-1 block">To</label>
            <input id="reports-to" type="date" className="input" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </div>
        </div>
        {hasFilters && (
          <button className="btn-ghost mt-3" onClick={clearFilters}>Clear Filters</button>
        )}
      </div>

      <div className="card overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">
          Team Effectiveness
        </div>
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Manager</th>
              <th className="px-5 py-3">Total Hours</th>
              <th className="px-5 py-3">Project-based</th>
              <th className="px-5 py-3">Activity-based</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && effectiveness.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-muted">No data for these filters.</td></tr>
            )}
            {effectiveness.map((e) => (
              <tr key={e.userId} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{e.name}</td>
                <td className="px-5 py-3 text-slate-600">{e.managerName}</td>
                <td className="px-5 py-3 text-slate-600">{e.totalHours.toFixed(1)}h</td>
                <td className="px-5 py-3">
                  <PercentCircle percent={e.projectEffectiveness} label="active projects" size={56} color="#B8863E" />
                </td>
                <td className="px-5 py-3">
                  <PercentCircle percent={e.activityEffectiveness} label="standard pace" size={56} color="#3D6B62" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="font-display font-semibold text-ink">Project Contribution</div>
          <button
            className="btn-ghost text-xs"
            onClick={() => setContributionSort((s) => (s === 'asc' ? 'desc' : 'asc'))}
          >
            Project Name {contributionSort === 'asc' ? '↑ A-Z' : '↓ Z-A'}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Hours</th>
              <th className="px-5 py-3">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && contributions.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-muted">No data for these filters.</td></tr>
            )}
            {contributions.map((c) => (
              <tr key={c.key} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{c.projectName}</td>
                <td className="px-5 py-3 text-slate-600">{c.userName}</td>
                <td className="px-5 py-3 text-slate-600">{c.hours.toFixed(1)}h</td>
                <td className="px-5 py-3">
                  <PercentCircle percent={c.contributionPercent} label="of project hours" size={56} color="#8A4B5E" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border font-display font-semibold text-ink">
          Time Log Detail ({filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'})
        </div>
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Manager</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Task</th>
              <th className="px-5 py-3">Start Time</th>
              <th className="px-5 py-3">Hours</th>
              <th className="px-5 py-3">Type</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && filteredLogs.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-muted">No entries match these filters.</td></tr>
            )}
            {filteredLogs.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{l.user_name}</td>
                <td className="px-5 py-3 text-slate-600">{l.manager_name || 'Unassigned'}</td>
                <td className="px-5 py-3 text-slate-600">{l.project_name}</td>
                <td className="px-5 py-3 text-slate-600">{l.task_name}</td>
                <td className="px-5 py-3 text-slate-600">{new Date(l.start_time).toLocaleString()}</td>
                <td className="px-5 py-3">{hoursBetween(l.start_time, l.end_time).toFixed(1)}h</td>
                <td className="px-5 py-3">
                  <span className={`badge ${l.type === 'overtime' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{l.type}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
