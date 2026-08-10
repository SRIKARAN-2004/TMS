import Modal from './Modal'

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

interface ProjectViewModalProps {
  open: boolean
  onClose: () => void
  project: any
  /** Called when the employee wants to jump to the Tasks page, pre-filtered
   * to this project - mirrors the "View Tasks" button on the Admin and
   * Manager project modals, instead of duplicating the task list inline. */
  onViewTasks?: () => void
}

export default function ProjectViewModal({ open, onClose, project, onViewTasks }: ProjectViewModalProps) {
  if (!project) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project.name}
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Status</div>
          <span className={`badge ${STATUS_COLORS[project.status] || ''}`}>
            {STATUS_LABEL[project.status] || project.status}
          </span>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Manager</div>
          <div className="text-sm font-medium text-ink">{project.manager_name || 'Unassigned'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Start Date</div>
          <div className="text-sm font-medium text-ink">{project.start_date || '—'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">End Date</div>
          <div className="text-sm font-medium text-ink">{project.end_date || '—'}</div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">Team Members</div>
        {project.members?.length ? (
          <div className="flex flex-wrap gap-2">
            {project.members.map((m: string) => (
              <span key={m} className="badge bg-blue-50 text-blue-700">{m}</span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted">No members assigned.</div>
        )}
      </div>

      {/* Tasks live on their own page (filtered to this project), the same
       * pattern the Admin and Manager project modals use, rather than a
       * duplicated read-only task list inline here. */}
      {onViewTasks && (
        <button className="btn-primary w-full" onClick={onViewTasks}>
          View Tasks ({project.task_count ?? 0})
        </button>
      )}
    </Modal>
  )
}
