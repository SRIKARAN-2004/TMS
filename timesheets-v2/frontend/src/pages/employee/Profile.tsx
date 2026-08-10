import { useEffect, useState } from 'react'

import { employeeApi } from '../../api/roles'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import { Roles } from '../../lib/roles'

export default function EmployeeProfile() {
  const [profile, setProfile] = useState<any>(null)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  useEffect(() => {
    employeeApi.myProfile().then(setProfile)
  }, [])

  if (!profile) {
    return <p className="text-muted text-sm">Loading…</p>
  }

  const primaryRole = profile.roles.includes(Roles.ADMIN)
    ? 'Admin'
    : profile.roles.includes(Roles.MANAGER)
    ? 'Manager'
    : 'Employee'

  const rows: [string, string][] = [
    ['User ID', profile.userid || '—'],
    ['Full Name', profile.name || '—'],
    ['Company Email', profile.company_mail || '—'],
    ['Phone Number', profile.phone_number || '—'],
    ['Username', profile.username || '—'],
    ['Role', primaryRole],
    ['Status', profile.isAlive ? 'Active' : 'Inactive'],
  ]

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-ink">My Profile</h1>
      <p className="text-sm text-muted mt-1 mb-6">Your account information. Contact admin to make changes.</p>

      <div className="card p-6 max-w-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-red-400 flex items-center justify-center font-display font-semibold text-lg text-white shrink-0">
            {profile.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
          </div>
          <div>
            <div className="font-display font-semibold text-lg text-ink">{profile.name}</div>
            <div className="text-sm text-muted">{profile.company_mail}</div>
            <div className="flex gap-2 mt-1.5">
              <span className="badge bg-blue-50 text-blue-600">{primaryRole}</span>
              <span className={`badge ${profile.isAlive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {profile.isAlive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-3">Account Details</div>
        <div className="divide-y divide-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted">{label}</span>
              <span className="font-medium text-ink">{value}</span>
            </div>
          ))}
        </div>
        <div className="pt-4">
          <button className="btn-ghost" onClick={() => setChangePasswordOpen(true)}>
            Change Password
          </button>
        </div>
      </div>

      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </div>
  )
}
