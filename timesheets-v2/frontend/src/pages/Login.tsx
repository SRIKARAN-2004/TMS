import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { forgotPassword } from '../api/auth'
import { toErrorMessage } from '../lib/exceptions'
import { Roles } from '../lib/roles'
import { Icon } from '../components/icons'

const QUOTES = [
  { text: 'What gets measured gets managed.', author: 'Peter Drucker' },
  { text: 'Time is the scarcest resource, and unless it is managed, nothing else can be managed.', author: 'Peter Drucker' },
  { text: 'It is not enough to be busy. The question is: what are we busy about?', author: 'Henry David Thoreau' },
  { text: 'Efficiency is doing things right; effectiveness is doing the right things.', author: 'Peter Drucker' },
  { text: 'Small daily improvements are the key to staggering long-term results.', author: 'James Clear' },
]

// A minimal watch face used as the page's signature element. Hour and
// minute hands are fixed at the classic "10:10" position watchmakers use
// in every advertisement, because it frames the crown/logo and reads as
// a smile - the only hand that actually moves is the second hand.
function ChronographDial() {
  const ticks = Array.from({ length: 12 })
  return (
    <svg viewBox="0 0 240 240" className="w-full h-full" aria-hidden="true">
      <circle cx="120" cy="120" r="112" fill="none" stroke="#2A2F38" strokeWidth="1.5" />
      <circle cx="120" cy="120" r="96" fill="none" stroke="#2A2F38" strokeWidth="1" />
      {ticks.map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180
        const isCardinal = i % 3 === 0
        const outer = 108
        const inner = isCardinal ? 92 : 100
        const x1 = 120 + outer * Math.sin(angle)
        const y1 = 120 - outer * Math.cos(angle)
        const x2 = 120 + inner * Math.sin(angle)
        const y2 = 120 - inner * Math.cos(angle)
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={isCardinal ? '#D9AD6B' : '#4A4F58'}
            strokeWidth={isCardinal ? 2.5 : 1.5}
            strokeLinecap="round"
          />
        )
      })}
      {/* Hour hand - fixed at 10 */}
      <line x1="120" y1="120" x2="82" y2="82" stroke="#D9AD6B" strokeWidth="5" strokeLinecap="round" />
      {/* Minute hand - fixed at 2 (reads as 10:10) */}
      <line x1="120" y1="120" x2="163" y2="76" stroke="#D9AD6B" strokeWidth="3.5" strokeLinecap="round" />
      {/* Second hand - the only moving part */}
      <g className="clock-second-hand">
        <line x1="120" y1="132" x2="120" y2="34" stroke="#B8863E" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <circle cx="120" cy="120" r="5" fill="#B8863E" />
    </svg>
  )
}

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotIdentifier, setForgotIdentifier] = useState('')
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotMessage, setForgotMessage] = useState<string | null>(null)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % QUOTES.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user = await login(username, password)
      const role = user.roles.includes(Roles.ADMIN)
        ? Roles.ADMIN
        : user.roles.includes(Roles.MANAGER)
        ? Roles.MANAGER
        : Roles.EMPLOYEE
      navigate(`/${role}`, { replace: true })
    } catch (err: any) {
      setError(toErrorMessage(err, 'Login failed. Check your credentials.'))
    } finally {
      setSubmitting(false)
    }
  }

  function closeForgot() {
    setForgotOpen(false)
    setForgotIdentifier('')
    setForgotMessage(null)
    setForgotError(null)
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault()
    setForgotError(null)
    setForgotSubmitting(true)
    try {
      const res = await forgotPassword(forgotIdentifier)
      setForgotMessage(res.message || "If an account matches, we've emailed instructions to reset the password.")
    } catch (err: any) {
      setForgotError(toErrorMessage(err, 'Could not process that request. Please try again.'))
    } finally {
      setForgotSubmitting(false)
    }
  }

  const quote = QUOTES[quoteIndex]

  return (
    <div className="min-h-screen flex font-body text-ink">
      {/* Left panel - the chronograph */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center p-12 bg-navy">
        <div className="login-panel-glow" />
        <div className="login-panel-grid" />
        <div className="relative z-10 max-w-md login-fade-in">
          <div className="flex items-center gap-3 mb-10">
            <div className="brand-mark w-11 h-11 border-2 border-accent2 text-lg text-accent2">
              T
            </div>
            <div>
              <span className="font-display font-semibold text-2xl text-white block leading-tight">Timesheet Tracking</span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-slate-500 font-mono">Application</span>
            </div>
          </div>

          <div className="w-56 h-56 mx-auto mb-10">
            <ChronographDial />
          </div>

          <h1 className="font-display font-semibold text-[28px] text-white leading-tight mb-3 text-center">
            Every hour, accounted for.
          </h1>
          <p className="text-slate-400 text-sm mb-10 text-center max-w-sm mx-auto">
            One place for admins, managers, and employees to stay in sync on projects, tasks, and hours.
          </p>

          <div key={quoteIndex} className="text-center" style={{ animation: 'quoteFade 6s ease-in-out' }}>
            <p className="text-slate-300 text-base leading-relaxed font-display italic">&ldquo;{quote.text}&rdquo;</p>
            <p className="text-slate-500 text-xs mt-2 font-mono tracking-wide">&mdash; {quote.author.toUpperCase()}</p>
          </div>
        </div>
      </div>

      {/* Right panel - the form */}
      <div className="flex-1 flex items-center justify-center bg-page px-4">
        <div className="w-full max-w-sm login-fade-in-delay-1">
          <div className="text-center mb-8 lg:hidden">
            <div className="brand-mark w-11 h-11 mx-auto border-2 border-accent text-lg mb-4 text-accent">
              T
            </div>
            <h1 className="font-display font-semibold text-2xl">Timesheet Tracking</h1>
          </div>
          <div className="hidden lg:block mb-8">
            <h2 className="font-display font-semibold text-[26px]">Welcome back</h2>
            <p className="text-sm text-muted mt-1">Sign in to continue to your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="card p-6 space-y-4 shadow-lg login-fade-in-delay-2">
            <div>
              <label htmlFor="login-username" className="text-xs font-medium text-muted mb-1.5 block font-mono uppercase tracking-wide">Username</label>
              <div className="relative">
                <input
                  id="login-username"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-xs font-medium text-muted font-mono uppercase tracking-wide">Password</label>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div>
              <div className="password-field">
                <input
                  id="login-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
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

            {error && (
              <div className="text-sm text-rust bg-[#FBEAE6] border border-[#F0C9BE] rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {forgotOpen && (
            <div className="card p-4 mt-4 login-fade-in">
              {forgotMessage ? (
                <>
                  <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                    {forgotMessage}
                  </p>
                  <button className="text-xs font-medium text-accent hover:underline mt-2" onClick={closeForgot}>
                    Got it
                  </button>
                </>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-3">
                  <p className="text-sm text-muted">
                    Enter your login username or the email on file for
                    your account, and we'll send a link to reset your password.
                  </p>
                  <div>
                    <label htmlFor="forgot-identifier" className="text-xs font-medium text-muted mb-1 block">
                      Username or email
                    </label>
                    <input
                      id="forgot-identifier"
                      className="input"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="e.g. admin or you@company.com"
                      required
                    />
                  </div>
                  {forgotError && (
                    <div className="text-sm text-rust bg-[#FBEAE6] border border-[#F0C9BE] rounded-lg px-3 py-2">
                      {forgotError}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={forgotSubmitting} className="btn-primary">
                      {forgotSubmitting ? 'Sending…' : 'Send reset link'}
                    </button>
                    <button type="button" className="text-xs font-medium text-muted hover:underline" onClick={closeForgot}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
