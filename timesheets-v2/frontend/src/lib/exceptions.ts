/**
 * Frontend custom exceptions.
 *
 * The backend has its own exception hierarchy (app/core/exceptions in the
 * backend) for errors that happen server-side and get sent back as JSON.
 * These are different - they cover errors that can happen entirely on the
 * frontend, before a request even reaches the server (network failures,
 * an expired session detected client-side, bad input caught before
 * submitting a form). Pages can throw/catch these for clearer error
 * handling instead of just reading raw strings everywhere.
 *
 * Usage:
 *   import { NetworkError, SessionExpiredError } from '../lib/exceptions'
 *   throw new NetworkError()
 */

export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

/** The request never reached the server at all - offline, backend down,
 * wrong API URL in .env, etc. Distinct from the server responding with an
 * error status, which means it WAS reached. */
export class NetworkError extends AppError {
  constructor(message = 'Could not reach the server. Check your connection and try again.') {
    super(message)
  }
}

/** The session cookie is missing or the server rejected it as expired/
 * invalid. Thrown by the axios response interceptor before redirecting to
 * /login, so any code that wants to react to this specifically (e.g. show
 * a toast before the redirect fires) has something concrete to catch. */
export class SessionExpiredError extends AppError {
  constructor(message = 'Your session has expired. Please log in again.') {
    super(message)
  }
}

/** A form was submitted with something missing/invalid that was caught
 * client-side, before ever calling the API - e.g. end time before start
 * time, picked in the UI but not yet sent to the backend's own validation. */
export class ValidationError extends AppError {
  constructor(public field: string, message?: string) {
    super(message || `${field} is invalid.`)
  }
}

/** Thrown when a user without the right role tries to load a page/action
 * that the frontend itself should have hidden - a defensive check for
 * "this shouldn't be reachable, but just in case." */
export class UnauthorizedActionError extends AppError {
  constructor(message = 'You do not have permission to do that.') {
    super(message)
  }
}

/**
 * Given an unknown error (usually an axios error caught in a try/catch),
 * extract the best available human-readable message - prefers the
 * backend's own {"detail": "..."} response body (which itself came from
 * the backend's AppException hierarchy), falls back to a NetworkError
 * message if the request never got a response at all, and finally falls
 * back to a generic message.
 *
 * `detail` isn't always a string: FastAPI's own request-validation layer
 * (a 422, thrown before the request ever reaches our route/service code)
 * sends `detail` as an ARRAY of Pydantic error objects, each shaped like
 * {type, loc, msg, input, ctx} - not the {"detail": "some string"} shape
 * our own AppException hierarchy always returns. Previously every caller
 * rendered `detail` straight into JSX assuming it was always a string;
 * with no error boundary in the app at the time, that object (or array of
 * objects) hitting React as a child crashed the entire render tree to a
 * blank page instead of showing the validation message. This normalizes
 * every shape `detail` can actually take into a plain string.
 */
export function toErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err && typeof err === 'object') {
    const anyErr = err as any
    const detail = anyErr.response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
    if (Array.isArray(detail) && detail.length) {
      // FastAPI/Pydantic validation error list - each entry has a
      // human-readable `msg` and a `loc` (field path) pinpointing which
      // field failed. Join every entry so multiple invalid fields are
      // all visible at once instead of only the first.
      return detail
        .map((e: any) => {
          if (typeof e === 'string') return e
          const field = Array.isArray(e?.loc) ? e.loc.filter((p: unknown) => p !== 'body').join('.') : null
          const msg = e?.msg || 'Invalid value'
          return field ? `${field}: ${msg}` : msg
        })
        .join('; ')
    }
    if (detail && typeof detail === 'object') {
      // Some other object shape we don't specifically recognize - stringify
      // rather than let it reach React as a raw object child.
      return (detail as any).msg || JSON.stringify(detail)
    }
    if (anyErr.request && !anyErr.response) {
      return new NetworkError().message
    }
    if (anyErr instanceof AppError) {
      return anyErr.message
    }
  }
  return fallback
}
