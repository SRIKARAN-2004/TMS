import axios from 'axios'
import { SessionExpiredError, NetworkError } from '../lib/exceptions'
import { ENDPOINTS } from './endpoints'

// The localhost fallback only applies in local dev (`vite dev`, import.meta.env.DEV).
// A production build (`vite build`) that's missing VITE_API_BASE_URL is a
// misconfiguration, not something that should silently start pointing at
// localhost:8000 - that would either fail every request in a confusing way
// or, worse, quietly work if the deployer happens to also have something
// listening on localhost:8000. Fail loudly instead so it's caught at build/
// deploy time rather than as a mystery in production.
function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL
  if (configured) return configured
  if (import.meta.env.DEV) return 'http://localhost:8000'
  throw new Error(
    'VITE_API_BASE_URL is not set. This build has no API base URL configured - set it at build time.'
  )
}

export const API_BASE_URL = resolveApiBaseUrl()

// withCredentials lets the browser send/receive the httpOnly auth cookie
// set by the backend on login. There's no token in localStorage anymore -
// the cookie is invisible to JS by design (protects against XSS reading it).
const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'X-CSRF-Token'
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

// Double-submit CSRF: the backend sets a non-httpOnly csrf_token cookie
// alongside the session cookie on login (see auth_routes.py). Every
// mutating request echoes that value back as a header; the backend's
// middleware rejects the request if the header is missing or doesn't
// match the cookie. A cross-site page can make the browser attach our
// cookies automatically, but it can't read this cookie's value (browsers
// don't expose another origin's cookies to page JS) to also set the
// header, so a forged cross-site request fails this check even though
// the session cookie itself would otherwise ride along.
client.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME)
    if (csrfToken) {
      config.headers = config.headers || {}
      config.headers[CSRF_HEADER_NAME] = csrfToken
    }
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      return handleUnauthorized(error)
    } else if (error?.request && !error?.response) {
      // Request was made but never got a response at all - backend down,
      // wrong VITE_API_BASE_URL, offline, etc.
      const netError = new NetworkError()
      console.warn(netError.message)
    }
    return Promise.reject(error)
  }
)

// The access token is short-lived on purpose (30 min - see backend
// core/config.py) - hitting a 401 partway through a normal session is the
// expected, common case now, not a rare edge case. Rather than bouncing
// to /login the instant that happens, try /auth/refresh once (it trades
// the longer-lived refresh_token cookie for a new access token) and
// silently retry whatever request just failed. Only redirect to /login if
// the refresh itself fails - meaning the refresh token is *also*
// expired/invalid, and there's genuinely no session left to recover.
//
// isRefreshing/pendingQueue coalesce multiple simultaneous 401s (e.g. a
// dashboard firing several requests at once right as the access token
// expires) into a single /auth/refresh call - without this, each of those
// requests would trigger its own refresh, each one rotating (and thereby
// invalidating) the refresh token the others were about to use.
let isRefreshing = false
let pendingQueue: Array<() => void> = []

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false
  return url.endsWith(ENDPOINTS.auth.refresh) || url.endsWith(ENDPOINTS.auth.login)
}

// A 401 from this endpoint means "current password was wrong" - a normal
// business-logic rejection the caller (ChangePasswordModal) needs to show
// to the user, not a sign the session/access-token expired. Without this
// check, handleUnauthorized would refresh the (still-valid) access token,
// retry the request, get the same 401 again since the password is still
// wrong, and then bounce the user to /login - silently discarding the
// actual "wrong password" error and logging them out for no reason.
function isChangePasswordEndpoint(url: string | undefined): boolean {
  if (!url) return false
  return url.endsWith('/employee/change-password')
}

function handleUnauthorized(error: any) {
  const originalRequest = error.config

  if (isChangePasswordEndpoint(originalRequest?.url)) {
    return Promise.reject(error)
  }

  // A 401 from /auth/login itself means "wrong username/password" - there
  // was never a session to begin with, so this isn't a session expiry.
  // Reject with the original error untouched so the real backend message
  // (e.g. "Invalid username or password") reaches Login.tsx via
  // toErrorMessage, instead of being replaced by bounceToLogin's generic
  // SessionExpiredError message.
  if (originalRequest?.url?.endsWith(ENDPOINTS.auth.login)) {
    return Promise.reject(error)
  }

  // Don't try to refresh-and-retry a request that has already been
  // retried once (avoids an infinite loop if the backend somehow keeps
  // returning 401 after a "successful" refresh), and don't try to refresh
  // in response to /auth/refresh itself failing - a 401 from it means
  // there's no session to recover, full stop, so go straight to the
  // redirect below instead.
  if (originalRequest?._retry || isAuthEndpoint(originalRequest?.url)) {
    return bounceToLogin()
  }
  originalRequest._retry = true

  if (isRefreshing) {
    // A refresh is already in flight (kicked off by a different failed
    // request) - queue this one to retry once that shared refresh
    // settles, instead of firing a second concurrent /auth/refresh.
    return new Promise((resolve, reject) => {
      pendingQueue.push(() => {
        client(originalRequest).then(resolve, reject)
      })
    })
  }

  isRefreshing = true
  return client
    .post(ENDPOINTS.auth.refresh)
    .then(() => {
      const queued = pendingQueue
      pendingQueue = []
      queued.forEach((run) => run())
      return client(originalRequest)
    })
    .catch(() => {
      pendingQueue = []
      return bounceToLogin()
    })
    .finally(() => {
      isRefreshing = false
    })
}

function bounceToLogin() {
  // The session cookie is missing/expired and refreshing it didn't help
  // (or wasn't applicable) - there's no local token to clear anymore, the
  // cookie itself is what expires or gets rejected server-side. Bounce to
  // login.
  const sessionError = new SessionExpiredError()
  console.warn(sessionError.message)
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
  return Promise.reject(sessionError)
}

export default client
