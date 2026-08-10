import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import IconAction from '../../components/IconAction'
import { Icon } from '../../components/icons'
import ConfirmDialog from '../../components/ConfirmDialog'
import { managerApi } from '../../api/roles'
import { notifyError } from '../../lib/toast'
import { toErrorMessage } from '../../lib/exceptions'

const PAGE_SIZE = 10

export default function ManagerTasks() {
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

  function load() {
    setLoading(true)
    const projectId = projectFilter ? Number(projectFilter) : undefined
    Promise.all([managerApi.listTasks(projectId), managerApi.listProjects()])
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

  const filteredProjectName = projectFilter
    ? projects.find((p) => String(p.id) === projectFilter)?.name
    : null

  function clearProjectFilter() {
    setSearchParams({})
  }

  const pagedTasks = tasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
        await managerApi.updateTask(editing.id, { name: form.name, description: form.description })
      } else {
        await managerApi.createTask({ project_id: Number(form.project_id), name: form.name, description: form.description })
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
      await managerApi.deleteTask(deleteTarget.id)
      load()
    } catch (err) {
      notifyError(err, 'Could not delete this task.')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Tasks under your projects"
        action={
          <button className="btn-primary" onClick={openCreate} disabled={projects.length === 0}>
            <span className="nav-icon" style={{ width: 14, height: 14 }}><Icon.Plus /></span> New Task
          </button>
        }
      />

      {projectFilter && (
        <div className="flex items-center justify-between bg-blue-50 text-blue-700 text-sm rounded-lg px-4 py-2.5 mb-4">
          <span>
            Showing tasks for <span className="font-medium">{filteredProjectName || `project #${projectFilter}`}</span> only
          </span>
          <button className="text-blue-700 underline font-medium" onClick={clearProjectFilter}>
            Clear filter — show all tasks
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Task</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Assigned On</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-muted">Loading…</td>
              </tr>
            )}
            {!loading && tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-muted">{projectFilter ? 'No tasks for this project yet.' : 'No tasks yet.'}</td>
              </tr>
            )}
            {pagedTasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{t.name}</td>
                <td className="px-5 py-3 text-slate-600">{t.project_name}</td>
                <td className="px-5 py-3 text-slate-600">{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                <td className="px-5 py-3 text-slate-600 truncate max-w-xs">{t.description || '—'}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <IconAction icon={<Icon.Pencil />} label="Edit" onClick={() => openEdit(t)} />
                    <IconAction icon={<Icon.Trash />} label="Delete" variant="danger" onClick={() => handleDelete(t.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalItems={tasks.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
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
