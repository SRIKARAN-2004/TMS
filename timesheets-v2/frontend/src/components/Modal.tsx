import { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
  /** Set false for modals the user must complete before doing anything
   * else (e.g. the forced password-change gate) - hides the × button and
   * stops backdrop clicks from closing it. Defaults to true. */
  dismissible?: boolean
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-lg',
  dismissible = true,
}: ModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="absolute inset-0 bg-slate-900/40" onClick={dismissible ? onClose : undefined} />
      <div className={`relative card w-full ${maxWidth} max-h-[90vh] flex flex-col shadow-xl`}>
        <div className="flex items-center justify-between px-6 pt-6 pb-5 shrink-0">
          <h3 id="modal-title" className="font-display font-semibold text-lg text-ink">{title}</h3>
          {dismissible && (
            <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none" aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className="space-y-4 px-6 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-6 pt-6 pb-6 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}
