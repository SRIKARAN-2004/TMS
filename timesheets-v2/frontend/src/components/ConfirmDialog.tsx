import Modal from './Modal'

interface ConfirmDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  /** True while the parent's onConfirm action is still in flight - disables
   * both buttons so a slow request can't be double-submitted by repeated
   * clicks, and swaps the confirm label to a "…ing" form. */
  confirming?: boolean
}

/**
 * Generic "are you sure?" dialog, built on top of the shared Modal shell.
 * Used for logout and any other action that shouldn't fire on a single
 * accidental click.
 */
export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  confirming = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth="max-w-sm"
      dismissible={!confirming}
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  )
}
