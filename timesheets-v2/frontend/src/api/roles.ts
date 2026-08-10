import client from './client'

// --- Admin ---
export const adminApi = {
  listUsers: () => client.get('/admin/users').then((r) => r.data),
  availableEmployees: () => client.get('/admin/available-employees').then((r) => r.data),
  managers: () => client.get('/admin/managers').then((r) => r.data),
  // A manager can be assigned to multiple projects, so this just excludes
  // whoever is already the manager on `projectId` (already selected) -
  // not managers who happen to be managing some other project.
  availableManagers: (projectId?: number) =>
    client.get('/admin/available-managers', { params: { project_id: projectId } }).then((r) => r.data),
  createUser: (payload: any) => client.post('/admin/users', payload).then((r) => r.data),
  importUsers: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return client
      .post('/admin/users/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data)
  },
  updateUser: (id: number, payload: any) => client.put(`/admin/users/${id}`, payload).then((r) => r.data),
  deactivateUser: (id: number) => client.delete(`/admin/users/${id}`).then((r) => r.data),
  resetPassword: (id: number, newPassword: string) =>
    client.put(`/admin/users/${id}/reset-password`, { new_password: newPassword }).then((r) => r.data),
  listRoles: () => client.get('/admin/roles').then((r) => r.data),

  listProjects: () => client.get('/admin/projects').then((r) => r.data),
  getProject: (id: number) => client.get(`/admin/projects/${id}`).then((r) => r.data),
  createProject: (payload: any) => client.post('/admin/projects', payload).then((r) => r.data),
  updateProject: (id: number, payload: any) => client.put(`/admin/projects/${id}`, payload).then((r) => r.data),
  deleteProject: (id: number) => client.delete(`/admin/projects/${id}`).then((r) => r.data),
  assignToProject: (id: number, userId: number) =>
    client.post(`/admin/projects/${id}/assign`, { user_id: userId }).then((r) => r.data),
  assignManyToProject: (id: number, userIds: number[]) =>
    client.post(`/admin/projects/${id}/assign-many`, { user_ids: userIds }).then((r) => r.data),
  unassignFromProject: (id: number, userId: number) =>
    client.delete(`/admin/projects/${id}/assign/${userId}`).then((r) => r.data),

  listTasks: (projectId?: number) =>
    client.get('/admin/tasks', { params: projectId ? { project_id: projectId } : {} }).then((r) => r.data),
  createTask: (payload: any) => client.post('/admin/tasks', payload).then((r) => r.data),
  updateTask: (id: number, payload: any) => client.put(`/admin/tasks/${id}`, payload).then((r) => r.data),
  deleteTask: (id: number) => client.delete(`/admin/tasks/${id}`).then((r) => r.data),

  listAllTimeLogs: () => client.get('/admin/time-logs').then((r) => r.data),
  logTimeFor: (payload: any) => client.post('/admin/time-logs', payload).then((r) => r.data),
  updateAnyTimeLog: (id: number, payload: any) => client.put(`/admin/time-logs/${id}`, payload).then((r) => r.data),
  deleteAnyTimeLog: (id: number) => client.delete(`/admin/time-logs/${id}`).then((r) => r.data),
  approveTimeLog: (id: number) => client.put(`/admin/time-logs/${id}/approve`).then((r) => r.data),
  rejectTimeLog: (id: number, reason: string) =>
    client.put(`/admin/time-logs/${id}/reject`, { reason }).then((r) => r.data),
}

// --- Manager ---
export const managerApi = {
  myTeam: () => client.get('/manager/team').then((r) => r.data),
  listProjects: () => client.get('/manager/projects').then((r) => r.data),
  getProject: (id: number) => client.get(`/manager/projects/${id}`).then((r) => r.data),
  createProject: (payload: any) => client.post('/manager/projects', payload).then((r) => r.data),
  updateProject: (id: number, payload: any) => client.put(`/manager/projects/${id}`, payload).then((r) => r.data),
  availableEmployees: () => client.get('/manager/available-employees').then((r) => r.data),
  assignManyToProject: (id: number, userIds: number[]) =>
    client.post(`/manager/projects/${id}/assign-many`, { user_ids: userIds }).then((r) => r.data),
  unassignFromProject: (id: number, userId: number) =>
    client.delete(`/manager/projects/${id}/assign/${userId}`).then((r) => r.data),
  listTasks: (projectId?: number) =>
    client.get('/manager/tasks', { params: projectId ? { project_id: projectId } : {} }).then((r) => r.data),
  createTask: (payload: any) => client.post('/manager/tasks', payload).then((r) => r.data),
  updateTask: (id: number, payload: any) => client.put(`/manager/tasks/${id}`, payload).then((r) => r.data),
  deleteTask: (id: number) => client.delete(`/manager/tasks/${id}`).then((r) => r.data),
  teamTimeLogs: () => client.get('/manager/time-logs').then((r) => r.data),
  logTimeFor: (payload: any) => client.post('/manager/time-logs', payload).then((r) => r.data),
  updateTeamTimeLog: (id: number, payload: any) => client.put(`/manager/time-logs/${id}`, payload).then((r) => r.data),
  deleteTeamTimeLog: (id: number) => client.delete(`/manager/time-logs/${id}`).then((r) => r.data),
  approveTimeLog: (id: number) => client.put(`/manager/time-logs/${id}/approve`).then((r) => r.data),
  rejectTimeLog: (id: number, reason: string) =>
    client.put(`/manager/time-logs/${id}/reject`, { reason }).then((r) => r.data),
}

// --- Employee ---
export const employeeApi = {
  myProfile: () => client.get('/employee/profile').then((r) => r.data),
  updateMyProfile: (payload: any) => client.put('/employee/profile', payload).then((r) => r.data),
  changeMyPassword: (currentPassword: string, newPassword: string) =>
    client.put('/employee/change-password', { current_password: currentPassword, new_password: newPassword }).then((r) => r.data),
  myProjects: () => client.get('/employee/my-projects').then((r) => r.data),
  myProjectDetail: (id: number) => client.get(`/employee/my-projects/${id}`).then((r) => r.data),
  tasksForProject: (projectId?: number) =>
    client.get('/employee/tasks', { params: projectId ? { project_id: projectId } : {} }).then((r) => r.data),
  myTimeLogs: () => client.get('/employee/time-logs').then((r) => r.data),
  logTime: (payload: any) => client.post('/employee/time-logs', payload).then((r) => r.data),
  updateTimeLog: (id: number, payload: any) => client.put(`/employee/time-logs/${id}`, payload).then((r) => r.data),
  deleteTimeLog: (id: number) => client.delete(`/employee/time-logs/${id}`).then((r) => r.data),
}
