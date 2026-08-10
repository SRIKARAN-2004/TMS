import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import ProjectViewModal from '../../components/ProjectViewModal'
import { employeeApi } from '../../api/roles'

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

export default function EmployeeMyProjects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [viewOpen, setViewOpen] = useState(false)
  const [viewProject, setViewProject] = useState<any>(null)

  useEffect(() => {
    employeeApi.myProjects().then(setProjects).finally(() => setLoading(false))
  }, [])

  async function openView(p: any) {
    const full = await employeeApi.myProjectDetail(p.id)
    setViewProject(full)
    setViewOpen(true)
  }

  // Matches the "View Tasks" redirect on the Admin and Manager project
  // modals - jumps straight to the employee's own Tasks page, pre-filtered
  // to this project via the ?project= query param, instead of showing a
  // second, duplicate task list inline in this modal.
  function goToTasks() {
    if (!viewProject) return
    setViewOpen(false)
    navigate(`/employee/tasks?project=${viewProject.id}`)
  }

  return (
    <div>
      <PageHeader title="My Projects" subtitle="Projects you have been assigned to." />

      <div className="space-y-3">
        {loading && <p className="text-muted text-sm">Loading…</p>}
        {!loading && projects.length === 0 && (
          <p className="text-muted text-sm">You're not assigned to any projects yet.</p>
        )}
        {projects.map((p) => (
          <div key={p.id} className="card p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h3 className="font-display font-semibold text-ink">{p.name}</h3>
                <span className={`badge ${STATUS_COLORS[p.status] || ''}`}>{STATUS_LABEL[p.status] || p.status}</span>
              </div>
              <div className="text-xs text-muted mb-1">
                <span className="font-medium text-slate-500">Start</span> {p.start_date || '—'}
                <span className="mx-2">·</span>
                <span className="font-medium text-slate-500">End</span> {p.end_date || '—'}
              </div>
              <div className="text-xs text-muted">
                {p.task_count} task{p.task_count === 1 ? '' : 's'} · Manager: {p.manager_name || 'Unassigned'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-ghost" onClick={() => navigate(`/employee/tasks?project=${p.id}`)}>
                View Tasks
              </button>
              <button className="btn-ghost" onClick={() => openView(p)}>View Project</button>
            </div>
          </div>
        ))}
      </div>

      <ProjectViewModal open={viewOpen} onClose={() => setViewOpen(false)} project={viewProject} onViewTasks={goToTasks} />
    </div>
  )
}
