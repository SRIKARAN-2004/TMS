import Modal from './Modal'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  rejected: 'bg-red-50 text-red-600',
}

const TYPE_BADGE: Record<string, string> = {
  overtime: 'bg-amber-50 text-amber-600',
  standard: 'bg-blue-50 text-blue-600',
}

interface TimeLogViewModalProps {
  open: boolean
  onClose: () => void
  log: any
  /** Whether to show the Employee field - false on the employee's own
   * page, where every row is already known to be theirs. */
  showEmployee?: boolean
}

function fmt(dt: string | null | undefined) {
  return dt ? new Date(dt).toLocaleString() : '—'
}
function durationHrs(start: string, end: string) {
  return ((new Date(end).getTime() - new Date(start).getTime()) / 1000 / 60 / 60).toFixed(1)
}

/**
 * Read-only "see everything about this entry" modal, shared by the
 * Admin, Manager, and Employee time log tables - one place stays the
 * source of truth for every field a log can have, instead of each
 * role's table cramming (or truncating) it into a row.
 */
export default function TimeLogViewModal({ open, onClose, log, showEmployee = true }: TimeLogViewModalProps) {
  if (!log) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Time Log Details"
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}
    >
      <div className="grid grid-cols-2 gap-3">
        {showEmployee && (
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Employee</div>
            <div className="text-sm font-medium text-ink">{log.user_name || '—'}</div>
          </div>
        )}
        <div className={`bg-slate-50 rounded-lg p-3 ${showEmployee ? '' : 'col-span-2'}`}>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Manager</div>
          <div className="text-sm font-medium text-ink">{log.manager_name || 'Unassigned'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Project</div>
          <div className="text-sm font-medium text-ink">{log.project_name || '—'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Task</div>
          <div className="text-sm font-medium text-ink">{log.task_name || '—'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Start Time</div>
          <div className="text-sm font-medium text-ink">{fmt(log.start_time)}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">End Time</div>
          <div className="text-sm font-medium text-ink">{fmt(log.end_time)}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Duration</div>
          <div className="text-sm font-medium text-ink">{durationHrs(log.start_time, log.end_time)}h</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Type</div>
          <span className={`badge ${TYPE_BADGE[log.type] || ''}`}>{log.type}</span>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Status</div>
          <span className={`badge ${STATUS_BADGE[log.status] || ''}`}>{log.status}</span>
          {log.status === 'rejected' && log.rejection_reason && (
            <div className="text-sm text-rust mt-2">{log.rejection_reason}</div>
          )}
        </div>
        <div className="bg-slate-50 rounded-lg p-3 col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Comments</div>
          <div className="text-sm text-ink whitespace-pre-wrap">{log.comments || '—'}</div>
        </div>
        {log.created_at && (
          <div className="bg-slate-50 rounded-lg p-3 col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Logged On</div>
            <div className="text-sm text-ink">{fmt(log.created_at)}</div>
          </div>
        )}
      </div>
    </Modal>
  )
}
