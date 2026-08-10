import { useState, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../api/auth'
import { toErrorMessage } from '../lib/exceptions'
import { Icon } from '../components/icons'

/**
 * Public page reached via the link emailed by /auth/forgot-password
 * (?token=...). Works identically for every role - admin, manager, or
 * employee - since resetting your own password isn't role-specific.
 * Mirrors ChangePasswordModal's New Password / Confirm Password fields,
 * but doesn't require the current password (the emailed token is the
 * proof of identity instead).
 */
export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setSubmitting(true)
    try {
      await resetPassword(token, newPassword, confirmPassword)
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err: any) {
      setError(toErrorMessage(err, 'Could not reset your password. The link may have expired.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4 font-body text-ink">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="brand-mark w-11 h-11 mx-auto border-2 border-accent text-lg mb-4 text-accent">
            T
          </div>
          <h1 className="font-display font-semibold text-2xl">Reset your password</h1>
          <p className="text-sm text-muted mt-1">Choose a new password for your account</p>
        </div>

        <div className="card p-6 space-y-4 shadow-lg">
          {!token && (
            <div className="text-sm text-rust bg-[#FBEAE6] border border-[#F0C9BE] rounded-lg px-3 py-2">
              This link is missing its reset token. Please use the link from your email, or
              request a new one from the login page.
            </div>
          )}

          {success ? (
            <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
              Password reset successfully — redirecting you to sign in…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="rp-new-password" className="text-xs font-medium text-muted mb-1.5 block">
                  New Password
                </label>
                <div className="password-field">
                  <input
                    id="rp-new-password"
                    type={showPassword ? 'text' : 'password'}
                    className="input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    disabled={!token}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <Icon.EyeOff /> : <Icon.Eye />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="rp-confirm-password" className="text-xs font-medium text-muted mb-1.5 block">
                  Confirm New Password
                </label>
                <input
                  id="rp-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={!token}
                  required
                />
              </div>

              {error && (
                <div className="text-sm text-rust bg-[#FBEAE6] border border-[#F0C9BE] rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button type="submit" disabled={submitting || !token} className="btn-primary w-full">
                {submitting ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          )}

          <div className="text-center">
            <Link to="/login" className="text-xs font-medium text-accent hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
