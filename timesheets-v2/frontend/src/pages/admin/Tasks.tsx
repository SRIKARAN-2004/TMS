import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import IconAction from '../../components/IconAction'
import { Icon } from '../../components/icons'
import ConfirmDialog from '../../components/ConfirmDialog'
import { adminApi } from '../../api/roles'
import { notifyError } from '../../lib/toast'
import { toErrorMessage } from '../../lib/exceptions'

const PAGE_SIZE = 10

export default function AdminTasks() {
  const [searchParams, setSearchParams] = useSearchParams()
  const projectFilter = searchParams.get('project')

  const [tasks, setTasks] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>({ project_id: '', name: '', description: '' })
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filterManager, setFilterManager] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  function load() {
    setLoading(true)
    const projectId = projectFilter ? Number(projectFilter) : undefined
    Promise.all([adminApi.listTasks(projectId), adminApi.listProjects()])
      .then(([t, p]) => {
        setTasks(t)
        setProjects(p)
      })
      .finally(() => setLoading(false))
  }

  // Re-runs whenever the ?project= filter changes (e.g. arriving here via
  // a project's "View Tasks" button, or clearing the filter below) - and
  // also resets to page 1, since a filtered set is usually much smaller
  // than whatever page you were previously on.
  useEffect(() => {
    setPage(1)
    load()
  }, [projectFilter])

  function handleProjectFilterChange(value: string) {
    if (value) setSearchParams({ project: value })
    else setSearchParams({})
  }

  const managerOptions = Array.from(new Set(tasks.map((t) => t.manager_name).filter(Boolean)))

  const filteredTasks = tasks.filter((t) => {
    if (filterManager && t.manager_name !== filterManager) return false
    if (filterStatus && (filterStatus === 'active' ? !t.isAlive : t.isAlive)) return false
    return true
  })

  const hasFilters = projectFilter || filterManager || filterStatus

  function clearFilters() {
    setSearchParams({})
    setFilterManager('')
    setFilterStatus('')
    setPage(1)
  }

  useEffect(() => setPage(1), [filterManager, filterStatus])

  const pagedTasks = filteredTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setEditing(null)
    setForm({ project_id: projectFilter || projects[0]?.id || '', name: '', description: '' })
    setError(null)
    setModalOpen(true)
  }

  function openEdit(t: any) {
    setEditing(t)
    setForm({ project_id: t.project_id, name: t.name, description: t.description || '' })
    setError(null)
    setModalOpen(true)
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      if (editing) {
        await adminApi.updateTask(editing.id, { name: form.name, description: form.description })
      } else {
        await adminApi.createTask({
          project_id: Number(form.project_id),
          name: form.name,
          description: form.description,
        })
      }
      setModalOpen(false)
      load()
    } catch (err: any) {
      setError(toErrorMessage(err, 'Could not save task'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleDelete(id: number) {
    setDeleteTarget(tasks.find((t) => t.id === id) || { id })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await adminApi.deleteTask(deleteTarget.id)
      load()
    } catch (err) {
      notifyError(err, 'Could not remove this task.')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Tasks across all projects - admin can also create and edit tasks directly, not only the manager"
        action={
          <button className="btn-primary" onClick={openCreate} disabled={projects.length === 0}>
            <span className="nav-icon" style={{ width: 14, height: 14 }}><Icon.Plus /></span> New Task
          </button>
        }
      />

      <div className="card p-4 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label htmlFor="tasks-filter-project" className="text-xs text-muted mb-1 block">Project</label>
            <select
              id="tasks-filter-project"
              className="input"
              value={projectFilter || ''}
              onChange={(e) => handleProjectFilterChange(e.target.value)}
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tasks-filter-manager" className="text-xs text-muted mb-1 block">Manager</label>
            <select id="tasks-filter-manager" className="input" value={filterManager} onChange={(e) => setFilterManager(e.target.value)}>
              <option value="">All Managers</option>
              {managerOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tasks-filter-status" className="text-xs text-muted mb-1 block">Status</label>
            <select id="tasks-filter-status" className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="removed">Removed</option>
            </select>
          </div>
        </div>
        {hasFilters && (
          <button className="btn-ghost mt-3" onClick={clearFilters}>Clear Filters</button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Task</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Manager</th>
              <th className="px-5 py-3">Assigned On</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && filteredTasks.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-muted">
                {tasks.length === 0 ? (projectFilter ? 'No tasks for this project yet.' : 'No tasks yet.') : 'No tasks match these filters.'}
              </td></tr>
            )}
            {pagedTasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{t.name}</td>
                <td className="px-5 py-3 text-slate-600">{t.project_name}</td>
                <td className="px-5 py-3 text-slate-600">{t.manager_name || '—'}</td>
                <td className="px-5 py-3 text-slate-600">{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                <td className="px-5 py-3 text-slate-600 truncate max-w-xs">{t.description || '—'}</td>
                <td className="px-5 py-3">
                  <span className={`badge ${t.isAlive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    {t.isAlive ? 'Active' : 'Removed'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {t.isAlive && (
                      <>
                        <IconAction icon={<Icon.Pencil />} label="Edit" onClick={() => openEdit(t)} />
                        <IconAction icon={<Icon.Trash />} label="Remove" variant="danger" onClick={() => handleDelete(t.id)} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} totalItems={filteredTasks.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Task' : 'New Task'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        {!editing && (
          <div>
            <label htmlFor="tasks-project" className="text-xs text-muted mb-1 block">Project</label>
            <select id="tasks-project" className="input" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="tasks-task-name" className="text-xs text-muted mb-1 block">Task Name</label>
          <input id="tasks-task-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="tasks-description" className="text-xs text-muted mb-1 block">Description</label>
          <textarea id="tasks-description" className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        confirming={deleting}
        title="Remove this task?"
        message={`"${deleteTarget?.name || 'This task'}" will be removed. This can't be undone.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  )
}
