import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import TimeLogFormModal from '../../components/TimeLogFormModal'
import TimeLogViewModal from '../../components/TimeLogViewModal'
import Pagination from '../../components/Pagination'
import IconAction from '../../components/IconAction'
import { Icon } from '../../components/icons'
import ConfirmDialog from '../../components/ConfirmDialog'
import { managerApi, employeeApi } from '../../api/roles'
import { useAuth } from '../../context/AuthContext'
import { notifyError } from '../../lib/toast'

const PAGE_SIZE = 10

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
  const [busyId, setBusyId] = useState<number | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewTarget, setViewTarget] = useState<any>(null)

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

  const pagedLogs = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // The manager's own team, for the "+ Log Time" employee picker - derived
  // from their projects' assigned members rather than a separate fetch,
  // since managerApi.listProjects() already returns each project's
  // managers+employees.
  const teamMembers = Array.from(
    new Map(
      projects.flatMap((p) => [...(p.managers || []), ...(p.employees || [])]).map((m: any) => [m.id, m])
    ).values()
  )

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

  async function handleReject(id: number) {
    const reason = window.prompt('Reason for rejecting this time log:')
    if (reason === null) return
    if (!reason.trim()) {
      window.alert('A reason is required to reject a time log.')
      return
    }
    setBusyId(id)
    try {
      await managerApi.rejectTimeLog(id, reason.trim())
      load()
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
  function durationHrs(start: string, end: string) {
    return ((new Date(end).getTime() - new Date(start).getTime()) / 1000 / 60 / 60).toFixed(1)
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
            {!loading && logs.length === 0 && (
              <tr><td colSpan={11} className="px-5 py-6 text-center text-muted">No time logs yet.</td></tr>
            )}
            {pagedLogs.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{l.user_name}</td>
                <td className="px-5 py-3 text-slate-600">{l.manager_name || 'Unassigned'}</td>
                <td className="px-5 py-3 text-slate-600">{l.project_name}</td>
                <td className="px-5 py-3 text-slate-600">{l.task_name}</td>
                <td className="px-5 py-3 text-slate-600">{fmt(l.start_time)}</td>
                <td className="px-5 py-3 text-slate-600">{fmt(l.end_time)}</td>
                <td className="px-5 py-3">{durationHrs(l.start_time, l.end_time)}h</td>
                <td className="px-5 py-3">
                  <span className={`badge ${l.type === 'overtime' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{l.type}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`badge ${STATUS_BADGE[l.status] || ''}`} title={l.status === 'rejected' ? l.rejection_reason || '' : undefined}>
                    {l.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-600 truncate max-w-[160px]">{l.comments || '—'}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <IconAction icon={<Icon.Eye />} label="View" onClick={() => openView(l)} />
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
        <Pagination page={page} totalItems={logs.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <TimeLogFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        employeeName={user?.name || ''}
        projects={projects}
        fetchTasks={(projectId) => managerApi.listTasks(projectId)}
        editing={editing}
        teamMembers={teamMembers}
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
    </div>
  )
}
