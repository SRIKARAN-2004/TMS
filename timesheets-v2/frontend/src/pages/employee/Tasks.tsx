import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import IconAction from '../../components/IconAction'
import { Icon } from '../../components/icons'
import { employeeApi } from '../../api/roles'

const PAGE_SIZE = 10

function fmt(dt: string | null | undefined) {
  return dt ? new Date(dt).toLocaleString() : '—'
}

/**
 * Read-only view of every task assigned to the employee across their
 * projects - when a manager assigns a new task it shows up here with
 * the project it belongs to and exactly when it was assigned (date and
 * time), so the employee doesn't have to dig through each project to
 * find out what's new on their plate.
 *
 * Filtering is driven purely by the ?project= query param (set when
 * arriving here via a project's "View Tasks" button on My Projects) -
 * matching the Admin/Manager Tasks pages, rather than a separate manual
 * dropdown filter duplicating the same thing.
 */
export default function EmployeeTasks() {
  const [searchParams, setSearchParams] = useSearchParams()
  const projectFilter = searchParams.get('project')

  const [tasks, setTasks] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [viewTask, setViewTask] = useState<any>(null)

  function load() {
    setLoading(true)
    const projectId = projectFilter ? Number(projectFilter) : undefined
    Promise.all([employeeApi.tasksForProject(projectId), employeeApi.myProjects()])
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

  // Most recently assigned first, so a newly-assigned task is the first
  // thing an employee sees when they open this page.
  const sortedTasks = [...tasks].sort((a, b) => {
    if (!a.created_at) return 1
    if (!b.created_at) return -1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const pagedTasks = sortedTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader title="Tasks" subtitle="Tasks assigned to you by your manager, across every project" />

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
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Task</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Assigned By</th>
              <th className="px-5 py-3">Assigned On</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && sortedTasks.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">{projectFilter ? 'No tasks for this project yet.' : 'No tasks assigned to you yet.'}</td></tr>
            )}
            {pagedTasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-ink">{t.name}</td>
                <td className="px-5 py-3 text-slate-600">{t.project_name}</td>
                <td className="px-5 py-3 text-slate-600">{t.manager_name || '—'}</td>
                <td className="px-5 py-3 text-slate-600">{fmt(t.created_at)}</td>
                <td className="px-5 py-3 text-slate-600 truncate max-w-xs">{t.description || '—'}</td>
                <td className="px-5 py-3 text-right">
                  <IconAction icon={<Icon.Eye />} label="View" onClick={() => setViewTask(t)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} totalItems={sortedTasks.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <Modal
        open={!!viewTask}
        onClose={() => setViewTask(null)}
        title={viewTask?.name || 'Task'}
        footer={<button className="btn-ghost" onClick={() => setViewTask(null)}>Close</button>}
      >
        {viewTask && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 col-span-2">
              <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Project</div>
              <div className="text-sm font-medium text-ink">{viewTask.project_name}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Assigned By</div>
              <div className="text-sm font-medium text-ink">{viewTask.manager_name || '—'}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Assigned On</div>
              <div className="text-sm font-medium text-ink">{fmt(viewTask.created_at)}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 col-span-2">
              <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Description</div>
              <div className="text-sm text-ink whitespace-pre-wrap">{viewTask.description || '—'}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
