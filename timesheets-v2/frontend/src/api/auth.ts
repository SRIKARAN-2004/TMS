import client from './client'
import { ENDPOINTS } from './endpoints'

export interface LoginResponse {
  // No access_token/token_type here - the backend deliberately keeps the
  // raw JWT out of the response body (it only ever travels as an httpOnly
  // cookie) so page JS, including this very client, can never read it.
  user_id: number
  userid: string
  name: string
  roles: string[]
  must_change_password: boolean
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await client.post<LoginResponse>('/auth/login', { username, password })
  return res.data
}

export async function fetchMe() {
  const res = await client.get('/auth/me')
  return res.data
}

export async function logout() {
  // Clears the httpOnly cookie server-side - the frontend can't delete it
  // directly since it's not readable/writable by JS.
  await client.post('/auth/logout')
}

/** Step 1 of "forgot password" - works for any role. `identifier` is
 * either the person's login username or the email on file for their
 * account. Backend always returns the same generic message regardless of
 * whether a match was found, so there's nothing role- or account-specific
 * to branch on here. */
export async function forgotPassword(identifier: string): Promise<{ status: string; message: string }> {
  const res = await client.post(ENDPOINTS.auth.forgotPassword, { identifier })
  return res.data
}

/** Step 2 - consumes the token from the emailed reset link along with a
 * new password + confirmation. */
export async function resetPassword(token: string, newPassword: string, confirmPassword: string) {
  const res = await client.post(ENDPOINTS.auth.resetPassword, {
    token,
    new_password: newPassword,
    confirm_password: confirmPassword,
  })
  return res.data
}
