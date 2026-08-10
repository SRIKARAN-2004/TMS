import { useEffect, useState } from 'react'
import Modal from './Modal'
import { toErrorMessage } from '../lib/exceptions'

interface TimeLogFormModalProps {
  open: boolean
  onClose: () => void
  onSave: (payload: any) => Promise<void>
  employeeName: string
  projects: any[]
  fetchTasks: (projectId: number) => Promise<any[]>
  editing?: any | null
  // When provided (admin/manager context), the Employee field becomes an
  // editable picker instead of a disabled label, and onSave's payload
  // includes user_id - this is what "+Log Time" needs to actually create
  // an entry for someone other than the caller. Previously the field was
  // always disabled/self-filled even on pages whose header claimed
  // org/team-wide scope, so those pages could only ever log the manager's
  // or admin's own time.
  teamMembers?: { id: number; name: string }[]
  currentUserId?: number
}

function toLocalInput(dt?: string) {
  if (!dt) return ''
  const d = new Date(dt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function durationHrs(start: string, end: string) {
  if (!start || !end) return null
  const h = (new Date(end).getTime() - new Date(start).getTime()) / 1000 / 60 / 60
  return Number.isFinite(h) ? h.toFixed(1) : null
}

// Adds `hours` (can be fractional, and can be 24 or more) to a
// datetime-local string and returns a new datetime-local string.
function addHours(start: string, hours: number) {
  if (!start || !Number.isFinite(hours)) return ''
  const d = new Date(start)
  d.setTime(d.getTime() + hours * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Shared "+ Log Time" form used identically by Admin, Manager, and Employee
 * time log pages, so the field set (Employee / Project / Task / Start Time /
 * End Time / Hours / Type / Comments) never drifts between roles.
 */
export default function TimeLogFormModal({
  open,
  onClose,
  onSave,
  employeeName,
  projects,
  fetchTasks,
  editing,
  teamMembers,
  currentUserId,
}: TimeLogFormModalProps) {
  const [tasks, setTasks] = useState<any[]>([])
  const [form, setForm] = useState({
    user_id: '',
    project_id: '',
    task_id: '',
    start_time: '',
    end_time: '',
    type: 'standard',
    comments: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Free-typed "Duration (hours)" - kept as its own text state (not just
  // derived) so the user can type "24" (or any number) directly and have
  // End Time computed from it. This exists because the native
  // datetime-local picker's hour wheel only accepts 00-23: typing "24"
  // into it gets silently clamped/reset by the browser to "00", which
  // quietly produces a wrong (near-zero) duration instead of a full day.
  // Typing the duration here sidesteps that picker limitation entirely.
  const [durationInput, setDurationInput] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      const nextForm = {
        user_id: String(editing.user_id ?? ''),
        project_id: String(editing.project_id),
        task_id: String(editing.task_id),
        start_time: toLocalInput(editing.start_time),
        end_time: toLocalInput(editing.end_time),
        type: editing.type,
        comments: editing.comments || '',
      }
      setForm(nextForm)
      setDurationInput(durationHrs(nextForm.start_time, nextForm.end_time) || '')
    } else {
      setForm({
        user_id: teamMembers ? '' : String(currentUserId ?? ''),
        project_id: '',
        task_id: '',
        start_time: '',
        end_time: '',
        type: 'standard',
        comments: '',
      })
      setDurationInput('')
    }
    setError(null)
  }, [open, editing])

  useEffect(() => {
    if (!form.project_id) {
      setTasks([])
      return
    }
    // Guards against fast project-switching showing stale tasks: if the
    // project changes again before this fetch resolves, `cancelled` stops
    // the older response from overwriting the newer selection's tasks.
    let cancelled = false
    fetchTasks(Number(form.project_id)).then((result) => {
      if (!cancelled) setTasks(result)
    })
    return () => {
      cancelled = true
    }
  }, [form.project_id])

  const duration = durationHrs(form.start_time, form.end_time)

  function handleDurationChange(raw: string) {
    setDurationInput(raw)
    const hours = parseFloat(raw)
    if (!form.start_time || raw.trim() === '' || !Number.isFinite(hours) || hours <= 0) return
    setForm((f) => ({ ...f, end_time: addHours(f.start_time, hours) }))
  }

  // Start/End Time each get their own handler (instead of one effect
  // watching both fields) so that editing Start or End updates the
  // Duration display, WITHOUT that same sync re-firing on every keystroke
  // typed into the Duration field itself. A shared effect keyed on
  // [start_time, end_time] would re-run the moment handleDurationChange
  // updates end_time, overwriting the field's own text (e.g. rounding "2"
  // to "2.0") mid-keystroke - so typing "24" one digit at a time would
  // actually produce "2.04" instead, since the "2" the user just typed
  // gets silently replaced by "2.0" before the "4" keystroke lands.
  function handleStartTimeChange(value: string) {
    setForm((f) => ({ ...f, start_time: value }))
    setDurationInput(durationHrs(value, form.end_time) || '')
  }

  function handleEndTimeChange(value: string) {
    setForm((f) => ({ ...f, end_time: value }))
    setDurationInput(durationHrs(form.start_time, value) || '')
  }

  async function handleSave() {
    setError(null)
    if (!form.project_id || !form.task_id || !form.start_time || !form.end_time) {
      setError('Please fill in project, task, start time, and end time.')
      return
    }
    if (teamMembers && !editing && !form.user_id) {
      setError('Please select an employee.')
      return
    }
    // The datetime-local inputs allow picking an end time before (or equal
    // to) the start time with no complaint - previously this went straight
    // to the server, which rendered as a negative or zero-duration entry
    // (e.g. "-2.0h") since only presence, not ordering, was checked here.
    if (new Date(form.end_time).getTime() <= new Date(form.start_time).getTime()) {
      setError('End time must be after start time.')
      return
    }
    setSubmitting(true)
    try {
      const payload: any = {
        project_id: Number(form.project_id),
        task_id: Number(form.task_id),
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        type: form.type,
        comments: form.comments,
      }
      // Only included when logging on behalf of someone else (new entry,
      // picker shown) - editing an existing log never changes who it
      // belongs to, and self-logging has no picker to read from.
      if (teamMembers && !editing) {
        payload.user_id = Number(form.user_id)
      }
      await onSave(payload)
    } catch (err: any) {
      setError(toErrorMessage(err, 'Could not save time log'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Time Log' : 'Log Time'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      <div>
        <label htmlFor="timelogformmodal-employee" className="text-xs text-muted mb-1 block">Employee</label>
        {teamMembers && !editing ? (
          <select
            id="timelogformmodal-employee"
            className="input"
            value={form.user_id}
            onChange={(e) => setForm({ ...form, user_id: e.target.value })}
          >
            <option value="">Select an employee</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <input id="timelogformmodal-employee" className="input bg-slate-50 text-slate-500" value={editing?.user_name || employeeName} disabled />
        )}
      </div>
      <div>
        <label htmlFor="timelogformmodal-project" className="text-xs text-muted mb-1 block">Project</label>
        <select id="timelogformmodal-project"
          className="input"
          value={form.project_id}
          onChange={(e) => setForm({ ...form, project_id: e.target.value, task_id: '' })}
        >
          <option value="">Select a project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="timelogformmodal-task" className="text-xs text-muted mb-1 block">Task</label>
        <select id="timelogformmodal-task"
          className="input"
          value={form.task_id}
          onChange={(e) => setForm({ ...form, task_id: e.target.value })}
          disabled={!form.project_id}
        >
          <option value="">Select a task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="timelogformmodal-start-time" className="text-xs text-muted mb-1 block">Start Time</label>
          <input id="timelogformmodal-start-time"
            type="datetime-local"
            className="input"
            value={form.start_time}
            onChange={(e) => handleStartTimeChange(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="timelogformmodal-end-time" className="text-xs text-muted mb-1 block">End Time</label>
          <input id="timelogformmodal-end-time"
            type="datetime-local"
            className="input"
            value={form.end_time}
            onChange={(e) => handleEndTimeChange(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted -mt-2">
        Prefer to type hours directly? Set Start Time, then enter a Duration below (e.g. 24 for
        a full day) — End Time will be calculated for you, so there's no need to hunt for
        "24:00" in the time picker (it only goes up to 23).
      </p>
      <div>
        <label htmlFor="timelogformmodal-duration-hours" className="text-xs text-muted mb-1 block">Duration (hours)</label>
        <input id="timelogformmodal-duration-hours"
          type="number"
          min="0"
          step="0.25"
          className="input"
          value={durationInput}
          onChange={(e) => handleDurationChange(e.target.value)}
          disabled={!form.start_time}
          placeholder={form.start_time ? 'e.g. 24' : 'Set Start Time first'}
        />
        {duration && form.end_time && (
          <p className="text-[11px] text-muted mt-1">= {duration}h (ends {new Date(form.end_time).toLocaleString()})</p>
        )}
      </div>
      <div>
        <label htmlFor="timelogformmodal-type" className="text-xs text-muted mb-1 block">Type</label>
        <select id="timelogformmodal-type" className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="standard">Standard</option>
          <option value="overtime">Overtime</option>
        </select>
      </div>
      <div>
        <label htmlFor="timelogformmodal-comments" className="text-xs text-muted mb-1 block">Comments</label>
        <textarea id="timelogformmodal-comments"
          className="input"
          rows={3}
          value={form.comments}
          onChange={(e) => setForm({ ...form, comments: e.target.value })}
        />
      </div>
    </Modal>
  )
}
