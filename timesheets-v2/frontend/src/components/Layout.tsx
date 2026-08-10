import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ConfirmDialog from './ConfirmDialog'
import ToastHost from './ToastHost'
import { Icon } from './icons'
import { Roles, Role } from '../lib/roles'

const NAV_ITEMS: Record<Role, { label: string; path: string; icon: (p: any) => JSX.Element }[]> = {
  [Roles.ADMIN]: [
    { label: 'Dashboard', path: '/admin', icon: Icon.Dashboard },
    { label: 'Users', path: '/admin/users', icon: Icon.User },
    { label: 'Roles', path: '/admin/roles', icon: Icon.Shield },
    { label: 'Projects', path: '/admin/projects', icon: Icon.Folder },
    { label: 'Tasks', path: '/admin/tasks', icon: Icon.CheckSquare },
    { label: 'Time Logs', path: '/admin/time-logs', icon: Icon.Clock },
    { label: 'Reports', path: '/admin/reports', icon: Icon.BarChart },
    { label: 'Settings', path: '/admin/settings', icon: Icon.Settings },
  ],
  [Roles.MANAGER]: [
    { label: 'Dashboard', path: '/manager', icon: Icon.Dashboard },
    { label: 'Projects', path: '/manager/projects', icon: Icon.Folder },
    { label: 'Tasks', path: '/manager/tasks', icon: Icon.CheckSquare },
    { label: 'Time Logs', path: '/manager/time-logs', icon: Icon.Clock },
    { label: 'Reports', path: '/manager/reports', icon: Icon.BarChart },
    { label: 'Settings', path: '/manager/settings', icon: Icon.Settings },
  ],
  [Roles.EMPLOYEE]: [
    { label: 'Dashboard', path: '/employee', icon: Icon.Dashboard },
    { label: 'My Projects', path: '/employee/my-projects', icon: Icon.Folder },
    { label: 'Tasks', path: '/employee/tasks', icon: Icon.CheckSquare },
    { label: 'Time Logs', path: '/employee/time-logs', icon: Icon.Clock },
    { label: 'Profile', path: '/employee/profile', icon: Icon.User },
  ],
}

// Role badges reuse the app's three accent hues rather than default
// red/amber/blue, so the same palette shows up in the sidebar, badges,
// and report rings throughout the app.
const ROLE_BADGE_COLOR: Record<Role, string> = {
  [Roles.ADMIN]: 'bg-[#FBEAE6] text-rust border border-[#F0C9BE]',
  [Roles.MANAGER]: 'bg-[#FBF3E7] text-[#8B5F26] border border-[#EAD9B8]',
  [Roles.EMPLOYEE]: 'bg-[#E9F1EF] text-teal border border-[#C7DAD5]',
}

export default function Layout() {
  const { user, logout, primaryRole } = useAuth()
  const role = primaryRole() || Roles.EMPLOYEE
  const items = NAV_ITEMS[role]
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-page text-ink font-body">
      <ToastHost />
      <aside className="w-64 shrink-0 flex flex-col bg-navy">
        <div className="px-5 py-5 flex items-center gap-3">
          <div className="brand-mark w-8 h-8 border-2 border-accent2 text-sm text-accent2">
            T
          </div>
          <div>
            <div className="font-display font-semibold text-[15px] text-white leading-tight">Timesheet Tracking</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider leading-tight font-mono">Application</div>
          </div>
        </div>

        <div className="px-5 pb-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold font-mono">View as role</div>
          <span className={`badge ${ROLE_BADGE_COLOR[role]} capitalize`}>{role}</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {items.map((item) => {
            const ItemIcon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === `/${role}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                    isActive ? 'bg-accent text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <span className="nav-icon opacity-90"><ItemIcon /></span>
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="px-3 pb-3">
          <button
            onClick={() => setConfirmLogoutOpen(true)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[13px] font-medium text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <span className="nav-icon"><Icon.LogOut /></span>
            Logout
          </button>
        </div>

        <ConfirmDialog
          open={confirmLogoutOpen}
          onCancel={() => setConfirmLogoutOpen(false)}
          onConfirm={() => {
            setConfirmLogoutOpen(false)
            logout()
          }}
          title="Log out?"
          message="You'll need to sign in again to access your dashboard."
          confirmLabel="Log out"
          danger
        />

        <div className="px-4 py-4 border-t border-navyBorder">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center font-display font-semibold text-sm text-white shrink-0">
              {user?.name?.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-white truncate">{user?.name}</div>
              <div className="text-[11px] text-slate-400 truncate capitalize">{role}</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
