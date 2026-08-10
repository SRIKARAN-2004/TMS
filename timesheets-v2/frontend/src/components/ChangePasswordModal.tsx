import { useState } from 'react'
import Modal from './Modal'
import { employeeApi } from '../api/roles'
import { toErrorMessage } from '../lib/exceptions'

interface ChangePasswordModalProps {
  open: boolean
  onClose: () => void
  /** When true, this is the mandatory post-login gate (must_change_password
   * flag), not a voluntary settings action: no Cancel button, no backdrop
   * or × dismissal, and onSuccess (not onClose) is required so the caller
   * can clear the flag once the change actually succeeds. */
  forced?: boolean
  onSuccess?: () => void
}

/**
 * Self-service password change - used identically by Admin Settings,
 * Manager Settings, and Employee Profile, since /employee/change-password
 * is already accessible to all three roles. Also reused as the forced
 * first-login gate (see AuthContext) via the `forced` prop.
 */
export default function ChangePasswordModal({ open, onClose, forced = false, onSuccess }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    setError(null)
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    setSubmitting(true)
    try {
      await employeeApi.changeMyPassword(currentPassword, newPassword)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onSuccess?.()
    } catch (err: any) {
      setError(toErrorMessage(err, 'Could not change password'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={forced ? 'Set a New Password' : 'Change Password'}
      maxWidth="max-w-sm"
      dismissible={!forced}
      footer={
        success ? (
          forced ? null : <button className="btn-primary" onClick={handleClose}>Done</button>
        ) : (
          <>
            {!forced && <button className="btn-ghost" onClick={handleClose}>Cancel</button>}
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving…' : 'Change Password'}
            </button>
          </>
        )
      }
    >
      {success ? (
        <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
          Password changed successfully{forced ? ' — redirecting you in…' : '.'}
        </p>
      ) : (
        <>
          {forced && (
            <p className="text-sm text-muted bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              You're using a temporary password. Set a new one before continuing.
            </p>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label htmlFor="cpm-current-password" className="text-xs text-muted mb-1 block">Current Password</label>
            <input
              id="cpm-current-password"
              type="password"
              className="input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cpm-new-password" className="text-xs text-muted mb-1 block">New Password</label>
            <input
              id="cpm-new-password"
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label htmlFor="cpm-confirm-password" className="text-xs text-muted mb-1 block">Confirm New Password</label>
            <input
              id="cpm-confirm-password"
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </>
      )}
    </Modal>
  )
}
