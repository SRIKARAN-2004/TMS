import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import { Roles } from './lib/roles'

import AdminDashboard from './pages/admin/Dashboard'
import AdminUsers from './pages/admin/Users'
import AdminRoles from './pages/admin/Roles'
import AdminProjects from './pages/admin/Projects'
import AdminTasks from './pages/admin/Tasks'
import AdminTimeLogs from './pages/admin/TimeLogs'
import AdminReports from './pages/admin/Reports'
import AdminSettings from './pages/admin/Settings'

import ManagerDashboard from './pages/manager/Dashboard'
import ManagerProjects from './pages/manager/Projects'
import ManagerTasks from './pages/manager/Tasks'
import ManagerTimeLogs from './pages/manager/TimeLogs'
import ManagerReports from './pages/manager/Reports'
import ManagerSettings from './pages/manager/Settings'

import EmployeeDashboard from './pages/employee/Dashboard'
import EmployeeMyProjects from './pages/employee/MyProjects'
import EmployeeTasks from './pages/employee/Tasks'
import EmployeeTimeLogs from './pages/employee/TimeLogs'
import EmployeeProfile from './pages/employee/Profile'

function RootRedirect() {
  const { user, loading, primaryRole } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  const role = primaryRole()
  return <Navigate to={role ? `/${role}` : '/login'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Admin - protected, admin role only */}
          <Route element={<ProtectedRoute allowedRoles={[Roles.ADMIN]} />}>
            <Route element={<Layout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/roles" element={<AdminRoles />} />
              <Route path="/admin/projects" element={<AdminProjects />} />
              <Route path="/admin/tasks" element={<AdminTasks />} />
              <Route path="/admin/time-logs" element={<AdminTimeLogs />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
            </Route>
          </Route>

          {/* Manager - protected, manager (or admin) role only */}
          <Route element={<ProtectedRoute allowedRoles={[Roles.MANAGER, Roles.ADMIN]} />}>
            <Route element={<Layout />}>
              <Route path="/manager" element={<ManagerDashboard />} />
              <Route path="/manager/projects" element={<ManagerProjects />} />
              <Route path="/manager/tasks" element={<ManagerTasks />} />
              <Route path="/manager/time-logs" element={<ManagerTimeLogs />} />
              <Route path="/manager/reports" element={<ManagerReports />} />
              <Route path="/manager/settings" element={<ManagerSettings />} />
            </Route>
          </Route>

          {/* Employee - protected, any authenticated role */}
          <Route element={<ProtectedRoute allowedRoles={[Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN]} />}>
            <Route element={<Layout />}>
              <Route path="/employee" element={<EmployeeDashboard />} />
              <Route path="/employee/my-projects" element={<EmployeeMyProjects />} />
              <Route path="/employee/tasks" element={<EmployeeTasks />} />
              <Route path="/employee/time-logs" element={<EmployeeTimeLogs />} />
              <Route path="/employee/profile" element={<EmployeeProfile />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
