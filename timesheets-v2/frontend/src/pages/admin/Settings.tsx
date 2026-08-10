import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/PageHeader'
import ChangePasswordModal from '../../components/ChangePasswordModal'

export default function AdminSettings() {
  const { user } = useAuth()
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  return (
    <div>
      <PageHeader title="Settings" subtitle="Account and system preferences" />
      <div className="card p-6 max-w-lg space-y-4">
        <div>
          <label htmlFor="settings-name" className="text-xs text-muted mb-1 block">Name</label>
          <input id="settings-name" className="input" value={user?.name || ''} disabled />
        </div>
        <div>
          <label htmlFor="settings-user-id" className="text-xs text-muted mb-1 block">User ID</label>
          <input id="settings-user-id" className="input" value={user?.userid || ''} disabled />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Roles</label>
          <div className="flex gap-2">
            {user?.roles.map((r) => (
              <span key={r} className="badge bg-blue-50 text-blue-600">
                {r}
              </span>
            ))}
          </div>
        </div>
        <div className="pt-2">
          <button className="btn-ghost" onClick={() => setChangePasswordOpen(true)}>
            Change Password
          </button>
        </div>
        <p className="text-xs text-muted pt-2">
          To edit account details, use the Users page.
        </p>
      </div>

      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </div>
  )
}
