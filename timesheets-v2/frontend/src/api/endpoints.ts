/**
 * Every backend API path lives here, and nowhere else. If a route prefix
 * ever changes (e.g. '/admin' becomes '/hr'), it only needs to change in
 * ONE place - the ROLE_PREFIX constants below - instead of hunting through
 * every function across auth.ts and roles.ts that happens to type out that
 * string by hand.
 */

// Change these three lines and every endpoint below updates automatically.
const ROLE_PREFIX = {
  auth: '/auth',
  admin: '/admin',
  manager: '/manager',
  employee: '/employee',
}

export const ENDPOINTS = {
  auth: {
    login: `${ROLE_PREFIX.auth}/login`,
    refresh: `${ROLE_PREFIX.auth}/refresh`,
    logout: `${ROLE_PREFIX.auth}/logout`,
    me: `${ROLE_PREFIX.auth}/me`,
    forgotPassword: `${ROLE_PREFIX.auth}/forgot-password`,
    resetPassword: `${ROLE_PREFIX.auth}/reset-password`,
  },

  admin: {
    users: `${ROLE_PREFIX.admin}/users`,
    user: (id: number) => `${ROLE_PREFIX.admin}/users/${id}`,
    importUsers: `${ROLE_PREFIX.admin}/users/import`,
    roles: `${ROLE_PREFIX.admin}/roles`,
    availableEmployees: `${ROLE_PREFIX.admin}/available-employees`,
    managers: `${ROLE_PREFIX.admin}/managers`,

    projects: `${ROLE_PREFIX.admin}/projects`,
    project: (id: number) => `${ROLE_PREFIX.admin}/projects/${id}`,
    projectAssign: (id: number) => `${ROLE_PREFIX.admin}/projects/${id}/assign`,
    projectUnassign: (id: number, userId: number) => `${ROLE_PREFIX.admin}/projects/${id}/assign/${userId}`,

    tasks: `${ROLE_PREFIX.admin}/tasks`,
    task: (id: number) => `${ROLE_PREFIX.admin}/tasks/${id}`,

    timeLogs: `${ROLE_PREFIX.admin}/time-logs`,
    timeLog: (id: number) => `${ROLE_PREFIX.admin}/time-logs/${id}`,
    approveTimeLog: (id: number) => `${ROLE_PREFIX.admin}/time-logs/${id}/approve`,
    rejectTimeLog: (id: number) => `${ROLE_PREFIX.admin}/time-logs/${id}/reject`,
  },

  manager: {
    team: `${ROLE_PREFIX.manager}/team`,

    projects: `${ROLE_PREFIX.manager}/projects`,
    project: (id: number) => `${ROLE_PREFIX.manager}/projects/${id}`,

    tasks: `${ROLE_PREFIX.manager}/tasks`,
    task: (id: number) => `${ROLE_PREFIX.manager}/tasks/${id}`,

    timeLogs: `${ROLE_PREFIX.manager}/time-logs`,
    approveTimeLog: (id: number) => `${ROLE_PREFIX.manager}/time-logs/${id}/approve`,
    rejectTimeLog: (id: number) => `${ROLE_PREFIX.manager}/time-logs/${id}/reject`,
  },

  employee: {
    profile: `${ROLE_PREFIX.employee}/profile`,

    myProjects: `${ROLE_PREFIX.employee}/my-projects`,
    myProjectDetail: (id: number) => `${ROLE_PREFIX.employee}/my-projects/${id}`,

    tasks: `${ROLE_PREFIX.employee}/tasks`,

    timeLogs: `${ROLE_PREFIX.employee}/time-logs`,
    timeLog: (id: number) => `${ROLE_PREFIX.employee}/time-logs/${id}`,
  },
}
