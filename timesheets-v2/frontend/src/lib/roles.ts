/**
 * Role name constants - the frontend equivalent of the backend's
 * app/core/roles.py.
 *
 * The strings "admin", "manager", "employee" used to be typed out
 * directly wherever a role check happened - in route guards, the sidebar
 * nav, badge colors, and the post-login redirect. That meant a typo in
 * any one of those spots would silently misroute a user or fail to guard
 * a route, and the TypeScript compiler had no way to catch it.
 *
 * Everything that needs to reference a role by name should import Roles
 * from here instead of writing the string literal directly. If a role
 * ever needs to be renamed, this is the only file that changes.
 */

export const Roles = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
} as const

export type Role = (typeof Roles)[keyof typeof Roles]

export const ALL_ROLES: Role[] = [Roles.ADMIN, Roles.MANAGER, Roles.EMPLOYEE]
