import { toErrorMessage } from './exceptions'

/**
 * Minimal pub/sub toast bus. Several destructive actions across the admin/
 * manager/employee pages (delete, deactivate, unassign) previously called
 * the API and did nothing with a failure - a 403 or a DB constraint
 * violation just vanished, and the row stayed in the table with no
 * indication anything went wrong. ToastHost (mounted once in Layout)
 * subscribes to this and renders whatever gets published here, so any
 * page can call notifyError()/notifySuccess() without holding its own
 * toast state.
 */

export type Toast = { id: number; message: string; variant: 'error' | 'success' }
type Listener = (toast: Toast) => void

let listeners: Listener[] = []
let counter = 0

export function subscribeToast(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

function emit(message: string, variant: Toast['variant']) {
  counter += 1
  const toast: Toast = { id: counter, message, variant }
  listeners.forEach((l) => l(toast))
}

/** Pass the caught error straight through - pulls the backend's
 * {"detail": "..."} message out when present, falls back otherwise. */
export function notifyError(err: unknown, fallback = 'Something went wrong. Please try again.') {
  emit(toErrorMessage(err, fallback), 'error')
}

export function notifySuccess(message: string) {
  emit(message, 'success')
}
