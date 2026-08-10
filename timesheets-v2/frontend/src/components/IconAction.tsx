import { ReactNode } from 'react'

interface IconActionProps {
  icon: ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger' | 'primary'
  disabled?: boolean
}

const VARIANT_CLASSES: Record<string, string> = {
  default: 'text-muted hover:text-accent hover:bg-[#FBF3E7]',
  danger: 'text-muted hover:text-rust hover:bg-[#FBEAE6]',
  primary: 'text-accent hover:bg-[#FBF3E7]',
}

/**
 * Icon-only action button used across every table (Edit, Delete, View,
 * Deactivate, Reset Password, etc). `label` is required and shown as a
 * native tooltip on hover (title attribute) plus screen-reader text, since
 * an icon alone isn't accessible or self-explanatory without it.
 */
export default function IconAction({ icon, label, onClick, variant = 'default', disabled = false }: IconActionProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]}`}
    >
      <span className="nav-icon" aria-hidden="true" style={{ width: 16, height: 16 }}>{icon}</span>
    </button>
  )
}
