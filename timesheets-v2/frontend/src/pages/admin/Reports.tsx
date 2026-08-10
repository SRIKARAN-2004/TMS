import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import PercentCircle from '../../components/PercentCircle'
import { adminApi } from '../../api/roles'
import { exportToCsv } from '../../lib/export'
import { Roles, Role } from '../../lib/roles'
import { Icon } from '../../components/icons'

function hoursBetween(start: string, end: string) {
  return (new Date(end).getTime() - new Date(start).getTime()) / 1000 / 60 / 60
}

export default function AdminReports() {
  const [logs, setLogs] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [filterProject, setFilterProject] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterManager, setFilterManager] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [contributionSort, setContributionSort] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    Promise.all([adminApi.listAllTimeLogs(), adminApi.listProjects(), adminApi.listUsers()])
      .then(([l, p, u]) => {
        setLogs(l)
        setProjects(p)
        setUsers(u)
      })
      .finally(() => setLoading(false))
  }, [])

  const managerNameByUserId = useMemo(() => {
    const map = new Map<number, string>()
    users.forEach((u) => map.set(u.id, u.manager_name || 'Unassigned'))
    return map
  }, [users])

  // Every user has exactly one role (admin.roles[0]) - build a lookup so
  // each row in the tables below can show that person's own role (Manager
  // vs Employee vs Admin), not just the name of who manages them.
  const roleByUserId = useMemo(() => {
    const map = new Map<number, Role>()
    users.forEach((u) => map.set(u.id, (u.roles?.[0] as Role) || Roles.EMPLOYEE))
    return map
  }, [users])

  function roleLabel(userId: number) {
    const role = roleByUserId.get(userId) || Roles.EMPLOYEE
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  function roleBadgeClass(userId: number) {
    const role = roleByUserId.get(userId) || Roles.EMPLOYEE
    if (role === Roles.MANAGER) return 'bg-amber-50 text-amber-600'
    if (role === Roles.ADMIN) return 'bg-red-50 text-red-500'
    return 'bg-blue-50 text-blue-600'
  }

  const managerOptions = useMemo(() => {
    const names = new Set<string>()
    users.forEach((u) => { if (u.manager_name) names.add(u.manager_name) })
    return Array.from(names)
  }, [users])

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterProject && String(l.project_id) !== filterProject) return false
      if (filterEmployee && String(l.user_id) !== filterEmployee) return false
      if (filterManager && (l.manager_name || managerNameByUserId.get(l.user_id)) !== filterManager) return false
      if (filterType && l.type !== filterType) return false
      if (filterFrom && new Date(l.start_time) < new Date(filterFrom)) return false
      if (filterTo && new Date(l.start_time) > new Date(filterTo + 'T23:59:59')) return false
      return true
    })
  }, [logs, filterProject, filterEmployee, filterType, filterFrom, filterTo])

  const totalHours = filteredLogs.reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)
  const standardHours = filteredLogs.filter((l) => l.type === 'standard').reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)
  const overtimeHours = filteredLogs.filter((l) => l.type === 'overtime').reduce((sum, l) => sum + hoursBetween(l.start_time, l.end_time), 0)
  const activeProjects = projects.filter((p) => p.status === 'in_progress').length

  // Per-employee effectiveness:
  // - Project-based: % of their hours spent on active/completed projects
  //   (vs projects that are archived or still in planning) - shows how much
  //   of their time is going toward genuinely productive work.
  // - Activity-based: % of their hours logged as 'standard' rather than
  //   'overtime' - a rough proxy for sustainable pace vs burnout risk.
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
        // Prefer the manager attached to the log itself (from the backend,
        // see TimeLogOut.manager_name) over the Users-list lookup - the log
        // is always present since every row here comes from filteredLogs,
        // whereas the Users-list map previously went blank whenever a
        // user's manager assignment changed after their logs were created,
        // or for a user who dropped off the /admin/users response for any
        // reason. Falling back to the Users-list map only if a specific log
        // is somehow missing the field.
        managerName: l.manager_name || managerNameByUserId.get(l.user_id) || 'Unassigned',
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
  }, [filteredLogs, projectStatusById, managerNameByUserId])

  // Contribution % = (employee's hours on a project / total hours logged
  // for that project) x 100. One row per (project, employee) pair that has
  // any hours, so a client can see exactly how much of a project's total
  // effort came from each person on it. Sortable by project name.
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
    setFilterManager('')
    setFilterType('')
    setFilterFrom('')
    setFilterTo('')
  }

  function handleExport() {
    exportToCsv('timesheets-report', filteredLogs.map((l) => ({
      Employee: l.user_name,
      Project: l.project_name,
      Task: l.task_name,
      'Start Time': l.start_time,
      'End Time': l.end_time,
      Hours: hoursBetween(l.start_time, l.end_time).toFixed(1),
      Type: l.type,
      Comments: l.comments || '',
    })))
  }

  const hasFilters = filterProject || filterEmployee || filterManager || filterType || filterFrom || filterTo

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Organization-wide hours - filter by project, employee, type, or date range"
        action={
          <button className="btn-primary" onClick={handleExport} disabled={loading || filteredLogs.length === 0}>
            <span className="nav-icon" style={{ width: 14, height: 14 }}><Icon.Download /></span> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-2xl font-display font-bold text-ink">{loading ? '—' : totalHours.toFixed(1)}h</div>
          <div className="text-xs text-muted mt-1">Total Hours (filtered)</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-display font-bold text-ink">{loading ? '—' : standardHours.toFixed(1)}h</div>
          <div className="text-xs text-muted mt-1">Standard Hours</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-display font-bold text-amber-600">{loading ? '—' : overtimeHours.toFixed(1)}h</div>
          <div className="text-xs text-muted mt-1">Overtime Hours</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-display font-bold text-ink">{loading ? '—' : activeProjects}</div>
          <div className="text-xs text-muted mt-1">Active Projects</div>
        </div>
      </div>

      <div className="card p-4 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
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
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="reports-manager" className="text-xs text-muted mb-1 block">Manager</label>
            <select id="reports-manager" className="input" value={filterManager} onChange={(e) => setFilterManager(e.target.value)}>
              <option value="">All Managers</option>
              {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
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
          Employee Effectiveness
        </div>
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Manager</th>
              <th className="px-5 py-3">Total Hours</th>
              <th className="px-5 py-3">Project-based</th>
              <th className="px-5 py-3">Activity-based</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && effectiveness.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">No data for these filters.</td></tr>
            )}
            {effectiveness.map((e) => (
              <tr key={e.userId} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{e.name}</td>
                <td className="px-5 py-3">
                  <span className={`badge ${roleBadgeClass(e.userId)}`}>{roleLabel(e.userId)}</span>
                </td>
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
              <th className="px-5 py-3">Role</th>
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
              <tr><td colSpan={8} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && filteredLogs.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-6 text-center text-muted">No entries match these filters.</td></tr>
            )}
            {filteredLogs.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{l.user_name}</td>
                <td className="px-5 py-3">
                  <span className={`badge ${roleBadgeClass(l.user_id)}`}>{roleLabel(l.user_id)}</span>
                </td>
                <td className="px-5 py-3 text-slate-600">{l.manager_name || managerNameByUserId.get(l.user_id) || 'Unassigned'}</td>
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
