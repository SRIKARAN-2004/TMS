import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import TimeLogFormModal from '../../components/TimeLogFormModal'
import TimeLogViewModal from '../../components/TimeLogViewModal'
import ConfirmDialog from '../../components/ConfirmDialog'
import Pagination from '../../components/Pagination'
import IconAction from '../../components/IconAction'
import { Icon } from '../../components/icons'
import { employeeApi } from '../../api/roles'
import { useAuth } from '../../context/AuthContext'
import { notifyError } from '../../lib/toast'

const PAGE_SIZE = 10

export default function EmployeeTimeLogs() {
  const { user } = useAuth()

  const [logs, setLogs] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)

  const [viewOpen, setViewOpen] = useState(false)
  const [viewTarget, setViewTarget] = useState<any>(null)

  // ============================================================
  // FILTER STATE
  // ============================================================

  const [quickFilter, setQuickFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [managerFilter, setManagerFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minHours, setMinHours] = useState('')
  const [maxHours, setMaxHours] = useState('')

  // ============================================================
  // LOAD DATA
  // ============================================================

  function load() {
    setLoading(true)

    Promise.all([
      employeeApi.myTimeLogs(),
      employeeApi.myProjects(),
    ])
      .then(([l, p]) => {
        setLogs(l)
        setProjects(p)
      })
      .catch((err) => {
        notifyError(err, 'Could not load time logs.')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  // ============================================================
  // FILTER LOGS
  // ============================================================

  const filteredLogs = useMemo(() => {
    const now = new Date()

    let quickFrom: Date | null = null
    let quickTo: Date | null = null

    // ----------------------------------------------------------
    // TODAY
    // ----------------------------------------------------------

    if (quickFilter === 'today') {
      quickFrom = new Date(now)
      quickFrom.setHours(0, 0, 0, 0)

      quickTo = new Date(now)
      quickTo.setHours(23, 59, 59, 999)
    }

    // ----------------------------------------------------------
    // THIS WEEK
    // ----------------------------------------------------------

    if (quickFilter === 'week') {
      quickFrom = new Date(now)

      const day = quickFrom.getDay()

      const diff = day === 0 ? 6 : day - 1

      quickFrom.setDate(quickFrom.getDate() - diff)
      quickFrom.setHours(0, 0, 0, 0)

      quickTo = new Date(quickFrom)
      quickTo.setDate(quickTo.getDate() + 6)
      quickTo.setHours(23, 59, 59, 999)
    }

    // ----------------------------------------------------------
    // THIS MONTH
    // ----------------------------------------------------------

    if (quickFilter === 'month') {
      quickFrom = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      )

      quickTo = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      )
    }

    return logs.filter((log) => {
      if (!log.start_time || !log.end_time) {
        return false
      }

      const logStart = new Date(log.start_time)
      const logEnd = new Date(log.end_time)

      // --------------------------------------------------------
      // QUICK FILTER
      // --------------------------------------------------------

      if (quickFrom && logStart < quickFrom) {
        return false
      }

      if (quickTo && logStart > quickTo) {
        return false
      }

      // --------------------------------------------------------
      // EMPLOYEE
      // --------------------------------------------------------

      const employeeName =
        log.employee_name || user?.name || ''

      if (
        employeeFilter &&
        employeeName.toLowerCase() !==
          employeeFilter.toLowerCase()
      ) {
        return false
      }

      // --------------------------------------------------------
      // MANAGER
      // --------------------------------------------------------

      if (
        managerFilter &&
        String(log.manager_name || '').toLowerCase() !==
          managerFilter.toLowerCase()
      ) {
        return false
      }

      // --------------------------------------------------------
      // TYPE
      // STANDARD / OVERTIME
      // --------------------------------------------------------

      if (
        typeFilter &&
        String(log.type || '').toLowerCase() !==
          typeFilter.toLowerCase()
      ) {
        return false
      }

      // --------------------------------------------------------
      // STATUS
      // --------------------------------------------------------

      if (
        statusFilter &&
        String(log.status || '').toLowerCase() !==
          statusFilter.toLowerCase()
      ) {
        return false
      }

      // --------------------------------------------------------
      // FROM DATE
      // --------------------------------------------------------

      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`)

        if (logStart < from) {
          return false
        }
      }

      // --------------------------------------------------------
      // TO DATE
      // --------------------------------------------------------

      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`)

        if (logStart > to) {
          return false
        }
      }

      // --------------------------------------------------------
      // HOURS
      // --------------------------------------------------------

      const hours =
        (logEnd.getTime() - logStart.getTime()) /
        1000 /
        60 /
        60

      // --------------------------------------------------------
      // MIN HOURS
      // --------------------------------------------------------

      if (
        minHours !== '' &&
        hours < Number(minHours)
      ) {
        return false
      }

      // --------------------------------------------------------
      // MAX HOURS
      // --------------------------------------------------------

      if (
        maxHours !== '' &&
        hours > Number(maxHours)
      ) {
        return false
      }

      return true
    })
  }, [
    logs,
    quickFilter,
    employeeFilter,
    managerFilter,
    typeFilter,
    statusFilter,
    fromDate,
    toDate,
    minHours,
    maxHours,
    user?.name,
  ])

  // ============================================================
  // PAGINATION
  // ============================================================

  const pagedLogs = filteredLogs.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  )

  // ============================================================
  // RESET PAGE WHEN FILTER CHANGES
  // ============================================================

  useEffect(() => {
    setPage(1)
  }, [
    quickFilter,
    employeeFilter,
    managerFilter,
    typeFilter,
    statusFilter,
    fromDate,
    toDate,
    minHours,
    maxHours,
  ])

  // ============================================================
  // CLEAR FILTERS
  // ============================================================

  function clearFilters() {
    setQuickFilter('')
    setEmployeeFilter('')
    setManagerFilter('')
    setTypeFilter('')
    setStatusFilter('')
    setFromDate('')
    setToDate('')
    setMinHours('')
    setMaxHours('')
    setPage(1)
  }

  // ============================================================
  // EMPLOYEE OPTIONS
  // ============================================================

  const employeeOptions = useMemo(() => {
    const names = logs
      .map((log) => log.employee_name || user?.name)
      .filter(Boolean)

    if (user?.name) {
      names.push(user.name)
    }

    return Array.from(new Set(names)).sort()
  }, [logs, user?.name])

  // ============================================================
  // MANAGER OPTIONS
  // ============================================================

  const managerOptions = useMemo(() => {
    const names = logs
      .map((log) => log.manager_name)
      .filter(Boolean)

    return Array.from(new Set(names)).sort()
  }, [logs])

  // ============================================================
  // CREATE
  // ============================================================

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  // ============================================================
  // EDIT
  // ============================================================

  function openEdit(log: any) {
    setEditing(log)
    setModalOpen(true)
  }

  // ============================================================
  // VIEW
  // ============================================================

  function openView(log: any) {
    setViewTarget(log)
    setViewOpen(true)
  }

  // ============================================================
  // SAVE
  // ============================================================

  async function handleSave(payload: any) {
    try {
      if (editing) {
        await employeeApi.updateTimeLog(
          editing.id,
          payload
        )
      } else {
        await employeeApi.logTime(payload)
      }

      setModalOpen(false)
      load()
    } catch (err) {
      notifyError(
        err,
        'Could not save this time log.'
      )
    }
  }

  // ============================================================
  // DELETE
  // ============================================================

  function handleDelete(id: number) {
    setDeleteTarget(
      logs.find((log) => log.id === id) || { id }
    )
  }

  async function confirmDelete() {
    if (!deleteTarget) return

    setDeleting(true)

    try {
      await employeeApi.deleteTimeLog(
        deleteTarget.id
      )

      load()
    } catch (err) {
      notifyError(
        err,
        'Could not delete this time log.'
      )
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // ============================================================
  // FORMAT DATE
  // ============================================================

  function fmt(dt: string) {
    return dt
      ? new Date(dt).toLocaleString()
      : '—'
  }

  // ============================================================
  // DURATION
  // ============================================================

  function durationHrs(
    start: string,
    end: string
  ) {
    if (!start || !end) {
      return '0.0'
    }

    return (
      (new Date(end).getTime() -
        new Date(start).getTime()) /
      1000 /
      60 /
      60
    ).toFixed(1)
  }

  // ============================================================
  // STATUS BADGE
  // ============================================================

  const STATUS_BADGE: Record<string, string> = {
    pending:
      'bg-amber-50 text-amber-600',

    approved:
      'bg-emerald-50 text-emerald-600',

    rejected:
      'bg-red-50 text-red-600',
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div>

      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="My Time Logs"
        subtitle="Log hours against your assigned projects and tasks"
        action={
          <button
            className="btn-primary"
            onClick={openCreate}
            disabled={projects.length === 0}
          >
            + Log Time
          </button>
        }
      />

      {/* ======================================================
          FILTERS
          ====================================================== */}

      <div className="card mb-4">
        <div className="p-4">

          <div className="mb-3">
            <h3 className="text-sm font-semibold text-ink">
              Filters
            </h3>
          </div>

          <div className="flex flex-wrap items-end gap-3">

            {/* QUICK */}

            <div className="min-w-[150px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Quick
              </label>

              <select
                value={quickFilter}
                onChange={(e) =>
                  setQuickFilter(e.target.value)
                }
                className="input w-full"
              >
                <option value="">
                  Quick
                </option>

                <option value="today">
                  Today
                </option>

                <option value="week">
                  This week
                </option>

                <option value="month">
                  This month
                </option>
              </select>
            </div>

            {/* EMPLOYEE */}

            <div className="min-w-[170px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Employee
              </label>

              <select
                value={employeeFilter}
                onChange={(e) =>
                  setEmployeeFilter(e.target.value)
                }
                className="input w-full"
              >
                <option value="">
                  All employees
                </option>

                {employeeOptions.map(
                  (employee) => (
                    <option
                      key={employee}
                      value={employee}
                    >
                      {employee}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* MANAGER */}

            <div className="min-w-[170px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Manager
              </label>

              <select
                value={managerFilter}
                onChange={(e) =>
                  setManagerFilter(e.target.value)
                }
                className="input w-full"
              >
                <option value="">
                  All managers
                </option>

                {managerOptions.map(
                  (manager) => (
                    <option
                      key={manager}
                      value={manager}
                    >
                      {manager}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* TYPE */}

            <div className="min-w-[150px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Type
              </label>

              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value)
                }
                className="input w-full"
              >
                <option value="">
                  All types
                </option>

                <option value="standard">
                  Standard
                </option>

                <option value="overtime">
                  Overtime
                </option>
              </select>
            </div>

            {/* STATUS */}

            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Status
              </label>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value)
                }
                className="input w-full"
              >
                <option value="">
                  All statuses
                </option>

                <option value="pending">
                  Pending
                </option>

                <option value="approved">
                  Approved
                </option>

                <option value="rejected">
                  Rejected
                </option>
              </select>
            </div>

            {/* FROM DATE */}

            <div className="min-w-[145px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                From date
              </label>

              <input
                type="date"
                value={fromDate}
                onChange={(e) =>
                  setFromDate(e.target.value)
                }
                className="input w-full"
              />
            </div>

            {/* TO DATE */}

            <div className="min-w-[145px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                To date
              </label>

              <input
                type="date"
                value={toDate}
                onChange={(e) =>
                  setToDate(e.target.value)
                }
                className="input w-full"
              />
            </div>

            {/* MIN HOURS */}

            <div className="min-w-[120px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Min hours
              </label>

              <input
                type="number"
                min="0"
                step="0.5"
                value={minHours}
                onChange={(e) =>
                  setMinHours(e.target.value)
                }
                placeholder="Min"
                className="input w-full"
              />
            </div>

            {/* MAX HOURS */}

            <div className="min-w-[120px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Max hours
              </label>

              <input
                type="number"
                min="0"
                step="0.5"
                value={maxHours}
                onChange={(e) =>
                  setMaxHours(e.target.value)
                }
                placeholder="Max"
                className="input w-full"
              />
            </div>

            {/* CLEAR FILTERS */}

            <div>
              <button
                type="button"
                onClick={clearFilters}
                className="btn-secondary whitespace-nowrap"
              >
                Clear filters
              </button>
            </div>

          </div>

          {/* RESULT COUNT */}

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">

            <span>
              Showing {filteredLogs.length} of{' '}
              {logs.length} time logs
            </span>

            {(quickFilter ||
              employeeFilter ||
              managerFilter ||
              typeFilter ||
              statusFilter ||
              fromDate ||
              toDate ||
              minHours ||
              maxHours) && (
              <span className="font-medium text-slate-600">
                Filters applied
              </span>
            )}

          </div>

        </div>
      </div>

      {/* ======================================================
          TIME LOG TABLE
          ====================================================== */}

      <div className="card overflow-hidden">

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead className="th-row">

              <tr className="text-left border-b border-border">

                <th className="px-5 py-3">
                  Employee
                </th>

                <th className="px-5 py-3">
                  Manager
                </th>

                <th className="px-5 py-3">
                  Project
                </th>

                <th className="px-5 py-3">
                  Task
                </th>

                <th className="px-5 py-3">
                  Start Time
                </th>

                <th className="px-5 py-3">
                  End Time
                </th>

                <th className="px-5 py-3">
                  Hours
                </th>

                <th className="px-5 py-3">
                  Type
                </th>

                <th className="px-5 py-3">
                  Status
                </th>

                <th className="px-5 py-3">
                  Comments
                </th>

                <th className="px-5 py-3 text-right">
                  Actions
                </th>

              </tr>

            </thead>

            <tbody>

              {/* LOADING */}

              {loading && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-5 py-6 text-center text-muted"
                  >
                    Loading…
                  </td>
                </tr>
              )}

              {/* EMPTY */}

              {!loading &&
                filteredLogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-5 py-6 text-center text-muted"
                    >
                      {logs.length === 0
                        ? 'No time logs yet.'
                        : 'No time logs match the selected filters.'}
                    </td>
                  </tr>
                )}

              {/* LOGS */}

              {!loading &&
                pagedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-border last:border-0 hover:bg-slate-50"
                  >

                    {/* EMPLOYEE */}

                    <td className="px-5 py-3 font-medium text-ink">
                      {log.employee_name ||
                        user?.name ||
                        '—'}
                    </td>

                    {/* MANAGER */}

                    <td className="px-5 py-3 text-slate-600">
                      {log.manager_name ||
                        'Unassigned'}
                    </td>

                    {/* PROJECT */}

                    <td className="px-5 py-3 text-slate-600">
                      {log.project_name || '—'}
                    </td>

                    {/* TASK */}

                    <td className="px-5 py-3 text-slate-600">
                      {log.task_name || '—'}
                    </td>

                    {/* START */}

                    <td className="px-5 py-3 text-slate-600">
                      {fmt(log.start_time)}
                    </td>

                    {/* END */}

                    <td className="px-5 py-3 text-slate-600">
                      {fmt(log.end_time)}
                    </td>

                    {/* HOURS */}

                    <td className="px-5 py-3">
                      {durationHrs(
                        log.start_time,
                        log.end_time
                      )}
                      h
                    </td>

                    {/* TYPE */}

                    <td className="px-5 py-3">

                      <span
                        className={`badge ${
                          String(log.type).toLowerCase() ===
                          'overtime'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-blue-50 text-blue-600'
                        }`}
                      >
                        {String(log.type).toLowerCase() ===
                        'standard'
                          ? 'Standard'
                          : String(log.type).toLowerCase() ===
                            'overtime'
                          ? 'Overtime'
                          : log.type || '—'}
                      </span>

                    </td>

                    {/* STATUS */}

                    <td className="px-5 py-3">

                      <span
                        className={`badge ${
                          STATUS_BADGE[
                            String(
                              log.status || ''
                            ).toLowerCase()
                          ] || ''
                        }`}
                        title={
                          String(
                            log.status || ''
                          ).toLowerCase() === 'rejected'
                            ? log.rejection_reason || ''
                            : undefined
                        }
                      >
                        {log.status || '—'}
                      </span>

                    </td>

                    {/* COMMENTS */}

                    <td className="px-5 py-3 text-slate-600 truncate max-w-[160px]">
                      {log.comments || '—'}
                    </td>

                    {/* ACTIONS */}

                    <td className="px-5 py-3 text-right">

                      <div className="flex justify-end gap-1">

                        <IconAction
                          icon={<Icon.Eye />}
                          label="View"
                          onClick={() =>
                            openView(log)
                          }
                        />

                        {log.status === 'pending' && (
                          <>

                            <IconAction
                              icon={
                                <Icon.Pencil />
                              }
                              label="Edit"
                              onClick={() =>
                                openEdit(log)
                              }
                            />

                            <IconAction
                              icon={
                                <Icon.Trash />
                              }
                              label="Delete"
                              variant="danger"
                              onClick={() =>
                                handleDelete(
                                  log.id
                                )
                              }
                            />

                          </>
                        )}

                      </div>

                    </td>

                  </tr>
                ))}

            </tbody>

          </table>

        </div>

        {/* ====================================================
            PAGINATION
            ==================================================== */}

        <Pagination
          page={page}
          totalItems={filteredLogs.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />

      </div>

      {/* ======================================================
          TIME LOG FORM
          ====================================================== */}

      <TimeLogFormModal
        open={modalOpen}
        onClose={() =>
          setModalOpen(false)
        }
        onSave={handleSave}
        employeeName={
          user?.name || ''
        }
        projects={projects}
        fetchTasks={(projectId) =>
          employeeApi.tasksForProject(
            projectId
          )
        }
        editing={editing}
      />

      {/* ======================================================
          VIEW MODAL
          ====================================================== */}

      <TimeLogViewModal
        open={viewOpen}
        onClose={() =>
          setViewOpen(false)
        }
        log={viewTarget}
        showEmployee={false}
      />

      {/* ======================================================
          DELETE CONFIRMATION
          ====================================================== */}

      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() =>
          setDeleteTarget(null)
        }
        onConfirm={confirmDelete}
        confirming={deleting}
        title="Delete this time log?"
        message="This entry will be removed from your time logs."
        confirmLabel="Delete"
        danger
      />

    </div>
  )
}