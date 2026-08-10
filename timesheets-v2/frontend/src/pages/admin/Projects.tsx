import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import IconAction from '../../components/IconAction'
import { Icon } from '../../components/icons'
import Pagination from '../../components/Pagination'
import ConfirmDialog from '../../components/ConfirmDialog'
import { adminApi } from '../../api/roles'
import { Roles, Role } from '../../lib/roles'
import { notifyError } from '../../lib/toast'
import { toErrorMessage } from '../../lib/exceptions'

const PAGE_SIZE = 10
const STATUS_OPTIONS = ['created', 'in_progress', 'completed', 'archived']
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

export default function AdminProjects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(empty())
  const [error, setError] = useState<string | null>(null)

  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [viewing, setViewing] = useState<any>(null)

  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<any>(null)
  const [assignKind, setAssignKind] = useState<Role>(Roles.EMPLOYEE)
  const [assignPickIds, setAssignPickIds] = useState<number[]>([])
  const [assignOptions, setAssignOptions] = useState<any[]>([])
  const [assignError, setAssignError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [unassignTarget, setUnassignTarget] = useState<{ projectId: number; userId: number; name: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [unassigning, setUnassigning] = useState(false)

  function empty() {
    return { name: '', start_date: '', end_date: '', status: 'created' }
  }

  function load() {
    setLoading(true)
    adminApi
      .listProjects()
      .then(setProjects)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const pagedProjects = projects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setEditing(null)
    setForm(empty())
    setError(null)
    setEditModalOpen(true)
  }

  function openEdit(p: any) {
    setEditing(p)
    setForm({ name: p.name, start_date: p.start_date || '', end_date: p.end_date || '', status: p.status })
    setError(null)
    setEditModalOpen(true)
  }

  async function openView(p: any) {
    const full = await adminApi.getProject(p.id)
    setViewing(full)
    setViewModalOpen(true)
  }

  async function openAssign(p: any, kind: Role) {
    setAssignTarget(p)
    setAssignKind(kind)
    setAssignPickIds([])
    setAssignError(null)
    setAssignModalOpen(true)
    // Employees not already on another project, or managers not already
    // the manager of THIS project (a manager can oversee several projects
    // at once, so other projects don't disqualify them here) - filtered
    // server-side so the picker can never show an ineligible name.
    const options =
      kind === Roles.MANAGER ? await adminApi.availableManagers(p.id) : await adminApi.availableEmployees()
    setAssignOptions(options)
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      const payload = { ...form, start_date: form.start_date || null, end_date: form.end_date || null }
      if (editing) await adminApi.updateProject(editing.id, payload)
      else await adminApi.createProject(payload)
      setEditModalOpen(false)
      load()
    } catch (err: any) {
      setError(toErrorMessage(err, 'Could not save project'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleDelete(id: number) {
    setDeleteTarget(projects.find((p) => p.id === id) || { id })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await adminApi.deleteProject(deleteTarget.id)
      load()
    } catch (err) {
      notifyError(err, 'Could not delete this project.')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  function toggleAssignPick(userId: number) {
    setAssignPickIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  async function handleAssignConfirm() {
    if (assignPickIds.length === 0 || !assignTarget) return
    setAssignError(null)
    setAssigning(true)
    try {
      if (assignKind === Roles.MANAGER) {
        // Managers are assigned one at a time (a project usually has a
        // single lead manager) - just use the first selection.
        await adminApi.assignToProject(assignTarget.id, assignPickIds[0])
      } else {
        const result = await adminApi.assignManyToProject(assignTarget.id, assignPickIds)
        if (result.skipped && result.skipped.length > 0) {
          setAssignError(
            `${result.assigned_count} assigned. Skipped: ${result.skipped.map((s: any) => s.reason).join(' ')}`
          )
          load()
          return
        }
      }
      setAssignModalOpen(false)
      load()
    } catch (err: any) {
      setAssignError(toErrorMessage(err, 'Could not assign user(s)'))
    } finally {
      setAssigning(false)
    }
  }

  function handleUnassign(projectId: number, userId: number, name: string) {
    setUnassignTarget({ projectId, userId, name })
  }

  function goToTasks(projectId: number) {
    setViewModalOpen(false)
    navigate(`/admin/tasks?project=${projectId}`)
  }

  async function confirmUnassign() {
    if (!unassignTarget) return
    const { projectId, userId } = unassignTarget
    setUnassigning(true)
    try {
      await adminApi.unassignFromProject(projectId, userId)
      const full = await adminApi.getProject(projectId)
      setViewing(full)
      load()
    } catch (err) {
      notifyError(err, 'Could not unassign this person.')
    } finally {
      setUnassigning(false)
      setUnassignTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} projects in total`}
        action={
          <button className="btn-primary" onClick={openCreate}>
            <span className="nav-icon" style={{ width: 14, height: 14 }}><Icon.Plus /></span> New Project
          </button>
        }
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Project Name</th>
              <th className="px-5 py-3">Manager</th>
              <th className="px-5 py-3">Start Date</th>
              <th className="px-5 py-3">End Date</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Team</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-muted">Loading…</td>
              </tr>
            )}
            {!loading && projects.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-muted">No projects yet.</td>
              </tr>
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
                <td className="px-5 py-4 text-slate-600">{p.manager_name || '—'}</td>
                <td className="px-5 py-4 text-slate-600">{p.start_date || '—'}</td>
                <td className="px-5 py-4 text-slate-600">{p.end_date || '—'}</td>
                <td className="px-5 py-4">
                  <span className={`badge ${STATUS_COLORS[p.status] || ''}`}>{STATUS_LABEL[p.status] || p.status}</span>
                </td>
                <td className="px-5 py-4 text-slate-600">{p.team_count} member{p.team_count === 1 ? '' : 's'}</td>
                <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <IconAction icon={<Icon.Pencil />} label="Edit" onClick={() => openEdit(p)} />
                    <IconAction icon={<Icon.Briefcase />} label="Assign Manager" onClick={() => openAssign(p, Roles.MANAGER)} />
                    <IconAction icon={<Icon.UserPlus />} label="Assign Employee" onClick={() => openAssign(p, Roles.EMPLOYEE)} />
                    <IconAction icon={<Icon.Trash />} label="Delete" variant="danger" onClick={() => handleDelete(p.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalItems={projects.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={editing ? 'Edit Project' : 'New Project'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditModalOpen(false)} disabled={submitting}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label htmlFor="projects-project-name" className="text-xs text-muted mb-1 block">Project Name</label>
          <input id="projects-project-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="projects-start-date" className="text-xs text-muted mb-1 block">Start Date</label>
            <input id="projects-start-date" type="date" className="input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label htmlFor="projects-end-date" className="text-xs text-muted mb-1 block">End Date</label>
            <input id="projects-end-date" type="date" className="input" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="projects-status" className="text-xs text-muted mb-1 block">Status</label>
          <select id="projects-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        {!editing && (
          <p className="text-xs text-muted">
            Assign managers and employees after creating the project, from the Assign Mgr / Assign Emp buttons.
          </p>
        )}
      </Modal>

      {/* View details modal */}
      <Modal
        open={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title={viewing?.name || 'Project'}
        footer={<button className="btn-ghost" onClick={() => setViewModalOpen(false)}>Close</button>}
      >
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Project ID</div>
                <div className="text-sm font-medium text-ink">{viewing.code}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Status</div>
                <span className={`badge ${STATUS_COLORS[viewing.status] || ''}`}>{STATUS_LABEL[viewing.status] || viewing.status}</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Start Date</div>
                <div className="text-sm font-medium text-ink">{viewing.start_date || '—'}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">End Date</div>
                <div className="text-sm font-medium text-ink">{viewing.end_date || '—'}</div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">Manager(s)</div>
              {viewing.managers?.length ? (
                <div className="flex flex-wrap gap-2">
                  {viewing.managers.map((m: any) => (
                    <span key={m.id} className="badge bg-blue-50 text-blue-700">
                      {m.name}
                      <button onClick={() => handleUnassign(viewing.id, m.id, m.name)} className="ml-1 text-blue-400 hover:text-blue-700">×</button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted">No manager assigned yet.</div>
              )}
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">Assigned Employees</div>
              {viewing.employees?.length ? (
                <div className="flex flex-wrap gap-2">
                  {viewing.employees.map((e: any) => (
                    <span key={e.id} className="badge bg-blue-50 text-blue-700">
                      {e.name}
                      <button onClick={() => handleUnassign(viewing.id, e.id, e.name)} className="ml-1 text-blue-400 hover:text-blue-700">×</button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted">No employees assigned yet.</div>
              )}
            </div>

            {/* Tasks live on their own page (filtered to this project)
             * rather than inline here, so the same list/edit/delete UI
             * Tasks already has doesn't need to be duplicated in a modal -
             * matches the same pattern on the Manager side. */}
            <button className="btn-primary w-full" onClick={() => goToTasks(viewing.id)}>
              View Tasks ({viewing.task_count})
            </button>
          </div>
        )}
      </Modal>

      {/* Assign manager / employee modal */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={assignKind === Roles.MANAGER ? `Assign Manager — ${assignTarget?.name}` : `Assign Employee — ${assignTarget?.name}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAssignModalOpen(false)} disabled={assigning}>Cancel</button>
            <button className="btn-primary" onClick={handleAssignConfirm} disabled={assignPickIds.length === 0 || assigning}>
              {assigning ? 'Assigning…' : `Assign ${assignKind === Roles.EMPLOYEE && assignPickIds.length > 0 ? `(${assignPickIds.length})` : ''}`}
            </button>
          </>
        }
      >
        {assignError && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{assignError}</div>}
        <div>
          <label className="text-xs text-muted mb-1 block">
            {assignKind === Roles.MANAGER ? 'Choose a manager' : 'Choose one or more available employees'}
          </label>
          <div className="max-h-56 overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {assignOptions.map((u) => (
              <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                <input
                  type={assignKind === Roles.MANAGER ? 'radio' : 'checkbox'}
                  name="assignPick"
                  checked={assignPickIds.includes(u.id)}
                  onChange={() =>
                    assignKind === Roles.MANAGER ? setAssignPickIds([u.id]) : toggleAssignPick(u.id)
                  }
                />
                {u.name}
              </label>
            ))}
          </div>
          {assignOptions.length === 0 && (
            <p className="text-xs text-muted mt-2">
              {assignKind === Roles.MANAGER
                ? 'No available managers - either none exist yet, or this project already has one assigned.'
                : 'No available employees - everyone with the employee role is already assigned to a project.'}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        confirming={deleting}
        title="Delete this project?"
        message={`"${deleteTarget?.name || 'This project'}" and all of its tasks will be removed. This can't be undone.`}
        confirmLabel="Delete"
        danger
      />

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
