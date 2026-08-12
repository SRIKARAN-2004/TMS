import { FormEvent, useEffect, useState } from 'react'
import Modal from './Modal'

interface RejectTimeLogDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
  employeeName?: string
  confirming?: boolean
}

export default function RejectTimeLogDialog({
  open,
  onCancel,
  onConfirm,
  employeeName,
  confirming = false,
}: RejectTimeLogDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setReason('')
      setError('')
    }
  }, [open])

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('A reason is required to reject a time log.')
      return
    }
    onConfirm(trimmed)
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Reject time log"
      maxWidth="max-w-md"
      dismissible={!confirming}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
          <button type="submit" form="reject-time-log-form" className="btn-danger" disabled={confirming}>
            {confirming ? 'Rejecting...' : 'Reject'}
          </button>
        </>
      }
    >
      <form id="reject-time-log-form" className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-slate-600">
          {employeeName ? `Add a reason for rejecting ${employeeName}'s time log.` : 'Add a reason for rejecting this time log.'}
        </p>
        <div>
          <label htmlFor="reject-reason" className="text-xs text-muted mb-1 block">
            Rejection reason
          </label>
          <textarea
            id="reject-reason"
            className="input w-full min-h-[120px] resize-y"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (error) setError('')
            }}
            disabled={confirming}
            autoFocus
          />
          {error && <div className="text-sm text-rust mt-2">{error}</div>}
        </div>
      </form>
    </Modal>
  )
}
