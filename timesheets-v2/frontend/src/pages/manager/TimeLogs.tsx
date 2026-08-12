import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import TimeLogFormModal from '../../components/TimeLogFormModal'
import TimeLogViewModal from '../../components/TimeLogViewModal'
import Pagination from '../../components/Pagination'
import IconAction from '../../components/IconAction'
import { Icon } from '../../components/icons'
import ConfirmDialog from '../../components/ConfirmDialog'
import RejectTimeLogDialog from '../../components/RejectTimeLogDialog'
import { managerApi, employeeApi } from '../../api/roles'
import { useAuth } from '../../context/AuthContext'
import { notifyError } from '../../lib/toast'

const PAGE_SIZE = 10

const EMPTY_FILTERS = {
  employee: '',
  manager: '',
  dateFrom: '',
  dateTo: '',
  hoursMin: '',
  hoursMax: '',
  type: '',
  status: '',
}

export default function ManagerTimeLogs() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<any>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewTarget, setViewTarget] = useState<any>(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  function load() {
    setLoading(true)
    Promise.all([managerApi.teamTimeLogs(), managerApi.listProjects()])
      .then(([l, p]) => {
        setLogs(l)
        setProjects(p)
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function durationHrs(start: string, end: string) {
    return (new Date(end).getTime() - new Date(start).getTime()) / 1000 / 60 / 60
  }

  // Distinct employee/manager names from the loaded logs, for the filter
  // dropdowns - avoids a separate fetch since the names are already here.
  const employeeOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.user_name).filter(Boolean))).sort(),
    [logs]
  )
  const managerOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.manager_name).filter(Boolean))).sort(),
    [logs]
  )

  function setFilter(key: keyof typeof EMPTY_FILTERS, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  const hasActiveFilters = Object.values(filters).some((v) => v !== '')

  const filteredLogs = useMemo(() => {
    const minHours = filters.hoursMin === '' ? null : parseFloat(filters.hoursMin)
    const maxHours = filters.hoursMax === '' ? null : parseFloat(filters.hoursMax)

    if (
      (minHours !== null && Number.isNaN(minHours)) ||
      (maxHours !== null && Number.isNaN(maxHours)) ||
      (minHours !== null && maxHours !== null && minHours > maxHours)
    ) {
      return []
    }

    return logs.filter((l) => {
      if (filters.employee && l.user_name !== filters.employee) return false
      if (filters.manager && (l.manager_name || 'Unassigned') !== filters.manager) return false
      if (filters.type && l.type !== filters.type) return false
      if (filters.status && l.status !== filters.status) return false

      const startTime = new Date(l.start_time).getTime()

      // Date filters operate on the calendar date of the time log.
      // The "to" date is inclusive through the end of that day.
      if (filters.dateFrom) {
        const from = new Date(`${filters.dateFrom}T00:00:00`).getTime()
        if (startTime < from) return false
      }
      if (filters.dateTo) {
        const to = new Date(`${filters.dateTo}T23:59:59.999`).getTime()
        if (startTime > to) return false
      }

      const hrs = durationHrs(l.start_time, l.end_time)
      if (minHours !== null && hrs < minHours) return false
      if (maxHours !== null && hrs > maxHours) return false

      return true
    })
  }, [logs, filters])

  const pagedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(l: any) {
    setEditing(l)
    setModalOpen(true)
  }

  function openView(l: any) {
    setViewTarget(l)
    setViewOpen(true)
  }

  async function handleSave(payload: any) {
    if (editing) await managerApi.updateTeamTimeLog(editing.id, payload)
    else if (payload.user_id) await managerApi.logTimeFor(payload)
    else await employeeApi.logTime(payload)
    setModalOpen(false)
    load()
  }

  function handleDelete(id: number) {
    setDeleteTarget(logs.find((l) => l.id === id) || { id })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await managerApi.deleteTeamTimeLog(deleteTarget.id)
      load()
    } catch (err) {
      notifyError(err, 'Could not delete this time log.')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function handleApprove(id: number) {
    setBusyId(id)
    try {
      await managerApi.approveTimeLog(id)
      load()
    } catch (err) {
      notifyError(err, 'Could not approve this time log.')
    } finally {
      setBusyId(null)
    }
  }

  function handleReject(id: number) {
    setRejectTarget(logs.find((l) => l.id === id) || { id })
  }

  async function confirmReject(reason: string) {
    if (!rejectTarget) return
    setBusyId(rejectTarget.id)
    try {
      await managerApi.rejectTimeLog(rejectTarget.id, reason)
      load()
      setRejectTarget(null)
    } catch (err) {
      notifyError(err, 'Could not reject this time log.')
    } finally {
      setBusyId(null)
    }
  }

  const STATUS_BADGE: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-600',
    approved: 'bg-emerald-50 text-emerald-600',
    rejected: 'bg-red-50 text-red-600',
  }

  function fmt(dt: string) {
    return dt ? new Date(dt).toLocaleString() : '—'
  }

  return (
    <div>
      <PageHeader
        title="Team Time Logs"
        subtitle="Entries from your direct reports and project teammates"
        action={
          <button className="btn-primary" onClick={openCreate} disabled={projects.length === 0}>
            + Log Time
          </button>
        }
      />

      <div className="card p-4 mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <h3 className="text-sm font-semibold text-ink">Filters</h3>
              {hasActiveFilters && (
                <span className="badge bg-blue-50 text-blue-600">
                  {Object.values(filters).filter(Boolean).length} active
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-medium text-muted whitespace-nowrap">Quick:</span>
              <button
                type="button"
                className="btn-ghost text-xs whitespace-nowrap"
                onClick={() => {
                  const today = new Date()
                  const value = today.toISOString().slice(0, 10)
                  setFilters((f) => ({ ...f, dateFrom: value, dateTo: value }))
                  setPage(1)
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="btn-ghost text-xs whitespace-nowrap"
                onClick={() => {
                  const today = new Date()
                  const day = today.getDay()
                  const mondayOffset = day === 0 ? -6 : 1 - day
                  const monday = new Date(today)
                  monday.setDate(today.getDate() + mondayOffset)
                  const sunday = new Date(monday)
                  sunday.setDate(monday.getDate() + 6)
                  setFilters((f) => ({
                    ...f,
                    dateFrom: monday.toISOString().slice(0, 10),
                    dateTo: sunday.toISOString().slice(0, 10),
                  }))
                  setPage(1)
                }}
              >
                This week
              </button>
              <button
                type="button"
                className="btn-ghost text-xs whitespace-nowrap"
                onClick={() => {
                  const today = new Date()
                  const first = new Date(today.getFullYear(), today.getMonth(), 1)
                  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
                  setFilters((f) => ({
                    ...f,
                    dateFrom: first.toISOString().slice(0, 10),
                    dateTo: last.toISOString().slice(0, 10),
                  }))
                  setPage(1)
                }}
              >
                This month
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-ghost text-xs whitespace-nowrap"
                  onClick={clearFilters}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Horizontal filter bar */}
          <div className="flex items-end gap-3 overflow-x-auto pb-1">
            <div className="min-w-[160px] flex-1">
              <label className="text-xs text-muted mb-1 block">Employee</label>
              <select
                className="input w-full"
                value={filters.employee}
                onChange={(e) => setFilter('employee', e.target.value)}
              >
                <option value="">All employees</option>
                {employeeOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[160px] flex-1">
              <label className="text-xs text-muted mb-1 block">Manager</label>
              <select
                className="input w-full"
                value={filters.manager}
                onChange={(e) => setFilter('manager', e.target.value)}
              >
                <option value="">All managers</option>
                {managerOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[130px]">
              <label className="text-xs text-muted mb-1 block">Type</label>
              <select
                className="input w-full"
                value={filters.type}
                onChange={(e) => setFilter('type', e.target.value)}
              >
                <option value="">All types</option>
                <option value="standard">Standard</option>
                <option value="overtime">Overtime</option>
              </select>
            </div>

            <div className="min-w-[140px]">
              <label className="text-xs text-muted mb-1 block">Status</label>
              <select
                className="input w-full"
                value={filters.status}
                onChange={(e) => setFilter('status', e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="min-w-[145px]">
              <label className="text-xs text-muted mb-1 block">From date</label>
              <input
                type="date"
                className="input w-full"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(e) => setFilter('dateFrom', e.target.value)}
              />
            </div>

            <div className="min-w-[145px]">
              <label className="text-xs text-muted mb-1 block">To date</label>
              <input
                type="date"
                className="input w-full"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(e) => setFilter('dateTo', e.target.value)}
              />
            </div>

            <div className="min-w-[120px]">
              <label className="text-xs text-muted mb-1 block">Min hours</label>
              <input
                type="number"
                min="0"
                step="0.25"
                className="input w-full"
                value={filters.hoursMin}
                onChange={(e) => setFilter('hoursMin', e.target.value)}
                placeholder="Min"
              />
            </div>

            <div className="min-w-[120px]">
              <label className="text-xs text-muted mb-1 block">Max hours</label>
              <input
                type="number"
                min="0"
                step="0.25"
                className="input w-full"
                value={filters.hoursMax}
                onChange={(e) => setFilter('hoursMax', e.target.value)}
                placeholder="Max"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Manager</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Task</th>
              <th className="px-5 py-3">Start Time</th>
              <th className="px-5 py-3">End Time</th>
              <th className="px-5 py-3">Hours</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Comments</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && filteredLogs.length === 0 && (
              <tr><td colSpan={11} className="px-5 py-6 text-center text-muted">
                {logs.length === 0 ? 'No time logs yet.' : 'No time logs match the current filters.'}
              </td></tr>
            )}
            {pagedLogs.map((l) => (
              <tr
                key={l.id}
                className="border-b border-border last:border-0 hover:bg-slate-50 cursor-pointer"
                onClick={() => openView(l)}
              >
                <td className="px-5 py-3 font-medium text-ink">{l.user_name}</td>
                <td className="px-5 py-3 text-slate-600">{l.manager_name || 'Unassigned'}</td>
                <td className="px-5 py-3 text-slate-600">{l.project_name}</td>
                <td className="px-5 py-3 text-slate-600">{l.task_name}</td>
                <td className="px-5 py-3 text-slate-600">{fmt(l.start_time)}</td>
                <td className="px-5 py-3 text-slate-600">{fmt(l.end_time)}</td>
                <td className="px-5 py-3">{durationHrs(l.start_time, l.end_time).toFixed(1)}h</td>
                <td className="px-5 py-3">
                  <span className={`badge ${l.type === 'overtime' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{l.type}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`badge ${STATUS_BADGE[l.status] || ''}`} title={l.status === 'rejected' ? l.rejection_reason || '' : undefined}>
                    {l.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-600 truncate max-w-[160px]">{l.comments || '—'}</td>
                <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    {l.user_id !== user?.id && l.status === 'pending' && (
                      <>
                        <IconAction icon={<Icon.Check />} label="Approve" onClick={() => handleApprove(l.id)} disabled={busyId === l.id} />
                        <IconAction icon={<Icon.X />} label="Reject" variant="danger" onClick={() => handleReject(l.id)} disabled={busyId === l.id} />
                      </>
                    )}
                    <IconAction icon={<Icon.Pencil />} label="Edit" onClick={() => openEdit(l)} disabled={busyId === l.id} />
                    <IconAction icon={<Icon.Trash />} label="Delete" variant="danger" onClick={() => handleDelete(l.id)} disabled={busyId === l.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} totalItems={filteredLogs.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <TimeLogFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        employeeName={user?.name || ''}
        projects={projects}
        fetchTasks={(projectId) => managerApi.listTasks(projectId)}
        editing={editing}
        currentUserId={user?.id}
      />

      <TimeLogViewModal open={viewOpen} onClose={() => setViewOpen(false)} log={viewTarget} />

      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        confirming={deleting}
        title="Delete this time log?"
        message={`This entry${deleteTarget?.user_name ? ` for ${deleteTarget.user_name}` : ''} will be permanently deleted.`}
        confirmLabel="Delete"
        danger
      />

      <RejectTimeLogDialog
        open={!!rejectTarget}
        onCancel={() => setRejectTarget(null)}
        onConfirm={confirmReject}
        confirming={busyId === rejectTarget?.id}
        employeeName={rejectTarget?.user_name}
      />
    </div>
  )
}
