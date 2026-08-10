import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import ConfirmDialog from '../../components/ConfirmDialog'
import { managerApi } from '../../api/roles'
import { notifyError } from '../../lib/toast'
import { toErrorMessage } from '../../lib/exceptions'

const PAGE_SIZE = 10
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

export default function ManagerProjects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [viewOpen, setViewOpen] = useState(false)
  const [viewing, setViewing] = useState<any>(null)

  // Employee-only assign flow - a manager can add free employees to their
  // own project the same way Admin's 'Assign Employee' picker works, just
  // scoped server-side to a project the manager actually owns and to the
  // employee role only (see /manager/projects/{id}/assign-many).
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignPickIds, setAssignPickIds] = useState<number[]>([])
  const [assignOptions, setAssignOptions] = useState<any[]>([])
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  const [unassignTarget, setUnassignTarget] = useState<{ userId: number; name: string } | null>(null)
  const [unassigning, setUnassigning] = useState(false)

  function load() {
    setLoading(true)
    managerApi.listProjects().then(setProjects).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const pagedProjects = projects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function openView(p: any) {
    const full = await managerApi.getProject(p.id)
    setViewing(full)
    setViewOpen(true)
  }

  async function openAssign() {
    setAssignPickIds([])
    setAssignError(null)
    setAssignModalOpen(true)
    // Same org-wide "not currently on any project" pool Admin's picker
    // uses - an employee can only ever be on one project.
    const options = await managerApi.availableEmployees()
    setAssignOptions(options)
  }

  function toggleAssignPick(userId: number) {
    setAssignPickIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  async function handleAssignConfirm() {
    if (assignPickIds.length === 0 || !viewing) return
    setAssignError(null)
    setAssigning(true)
    try {
      const result = await managerApi.assignManyToProject(viewing.id, assignPickIds)
      if (result.skipped && result.skipped.length > 0) {
        setAssignError(
          `${result.assigned_count} assigned. Skipped: ${result.skipped.map((s: any) => s.reason).join(' ')}`
        )
      } else {
        setAssignModalOpen(false)
      }
      const full = await managerApi.getProject(viewing.id)
      setViewing(full)
      load()
    } catch (err: any) {
      setAssignError(toErrorMessage(err, 'Could not assign employee(s)'))
    } finally {
      setAssigning(false)
    }
  }

  function handleUnassign(userId: number, name: string) {
    setUnassignTarget({ userId, name })
  }

  async function confirmUnassign() {
    if (!unassignTarget || !viewing) return
    setUnassigning(true)
    try {
      await managerApi.unassignFromProject(viewing.id, unassignTarget.userId)
      const full = await managerApi.getProject(viewing.id)
      setViewing(full)
      load()
    } catch (err) {
      notifyError(err, 'Could not unassign this person.')
    } finally {
      setUnassigning(false)
      setUnassignTarget(null)
    }
  }

  function goToTasks() {
    if (!viewing) return
    setViewOpen(false)
    navigate(`/manager/tasks?project=${viewing.id}`)
  }

  return (
    <div>
      <PageHeader title="My Projects" subtitle="Projects assigned to you as manager." />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Project Name</th>
              <th className="px-5 py-3">Start Date</th>
              <th className="px-5 py-3">End Date</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Team Size</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && projects.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-muted">No projects assigned to you yet.</td></tr>
            )}
            {pagedProjects.map((p) => (
              <tr
                key={p.id}
                onClick={() => openView(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openView(p)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`View ${p.name}`}
                className="border-b border-border last:border-0 hover:bg-slate-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
              >
                <td className="px-5 py-4 font-medium text-ink">{p.name}</td>
                <td className="px-5 py-4 text-slate-600">{p.start_date || '—'}</td>
                <td className="px-5 py-4 text-slate-600">{p.end_date || '—'}</td>
                <td className="px-5 py-4">
                  <span className={`badge ${STATUS_COLORS[p.status] || ''}`}>{STATUS_LABEL[p.status] || p.status}</span>
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {p.team_count} employee{p.team_count === 1 ? '' : 's'} · {p.task_count} task{p.task_count === 1 ? '' : 's'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalItems={projects.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {/* View details modal */}
      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={viewing?.name || 'Project'}
        footer={<button className="btn-ghost" onClick={() => setViewOpen(false)}>Close</button>}
      >
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Status</div>
                <span className={`badge ${STATUS_COLORS[viewing.status] || ''}`}>{STATUS_LABEL[viewing.status] || viewing.status}</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Start Date</div>
                <div className="text-sm font-medium text-ink">{viewing.start_date || '—'}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">End Date</div>
                <div className="text-sm font-medium text-ink">{viewing.end_date || '—'}</div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Assigned Employees</div>
                <button className="btn-ghost text-xs" onClick={openAssign}>+ Assign Employee</button>
              </div>
              {viewing.employees?.length ? (
                <div className="flex flex-wrap gap-2">
                  {viewing.employees.map((e: any) => (
                    <span key={e.id} className="badge bg-blue-50 text-blue-700">
                      {e.name}
                      <button onClick={() => handleUnassign(e.id, e.name)} className="ml-1 text-blue-400 hover:text-blue-700" aria-label={`Unassign ${e.name}`}>×</button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted">No employees assigned yet.</div>
              )}
            </div>

            {/* Tasks live on their own page (filtered to this project) rather
             * than inline here, so the same list/edit/delete UI Tasks
             * already has doesn't need to be duplicated inside a modal. */}
            <button className="btn-primary w-full" onClick={goToTasks}>
              View Tasks ({viewing.task_count})
            </button>
          </div>
        )}
      </Modal>

      {/* Assign employee modal */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={`Assign Employee — ${viewing?.name || ''}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAssignModalOpen(false)} disabled={assigning}>Cancel</button>
            <button className="btn-primary" onClick={handleAssignConfirm} disabled={assignPickIds.length === 0 || assigning}>
              {assigning ? 'Assigning…' : `Assign ${assignPickIds.length > 0 ? `(${assignPickIds.length})` : ''}`}
            </button>
          </>
        }
      >
        {assignError && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{assignError}</div>}
        <div>
          <label className="text-xs text-muted mb-1 block">Choose one or more available employees</label>
          <div className="max-h-56 overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {assignOptions.map((u) => (
              <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={assignPickIds.includes(u.id)}
                  onChange={() => toggleAssignPick(u.id)}
                />
                {u.name}
              </label>
            ))}
          </div>
          {assignOptions.length === 0 && (
            <p className="text-xs text-muted mt-2">
              No available employees - everyone with the employee role is already assigned to a project.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!unassignTarget}
        onCancel={() => setUnassignTarget(null)}
        onConfirm={confirmUnassign}
        confirming={unassigning}
        title="Remove from project?"
        message={`${unassignTarget?.name || 'This person'} will be unassigned from this project.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  )
}
