import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import IconAction from '../../components/IconAction'
import { Icon } from '../../components/icons'
import ConfirmDialog from '../../components/ConfirmDialog'
import Pagination from '../../components/Pagination'
import { adminApi } from '../../api/roles'
import { Roles, ALL_ROLES } from '../../lib/roles'
import { notifyError } from '../../lib/toast'
import { exportToCsv } from '../../lib/export'
import { toErrorMessage } from '../../lib/exceptions'

const ROLE_OPTIONS = ALL_ROLES
// Exactly a 10-digit phone number, optionally prefixed with a leading +
// and a 1-3 digit country code - mirrors the backend PHONE_PATTERN in
// app/schemas/user.py. Previously /^\+?\d{7,15}$/ accepted anywhere from
// 7 to 15 bare digits, so both 10 and 11 plain digits passed silently.
const PHONE_PATTERN = /^(\+\d{1,3})?\d{10}$/
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PAGE_SIZE = 10

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(emptyForm())
  const [error, setError] = useState<string | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const [deactivateTarget, setDeactivateTarget] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [deactivating, setDeactivating] = useState(false)

  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{
    created: number
    failed: number
    results: { row: number; userid: string | null; status: string; message: string }[]
  } | null>(null)

  function emptyForm() {
    return {
      userid: '',
      name: '',
      company_mail: '',
      phone_number: '',
      username: '',
      password: '',
      role: Roles.EMPLOYEE,
    }
  }

  function load() {
    setLoading(true)
    adminApi
      .listUsers()
      .then(setUsers)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const pagedUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function suggestNextUserId() {
    const nums = users
      .map((u) => {
        const match = /^EMP(\d+)$/i.exec(u.userid || '')
        return match ? parseInt(match[1], 10) : null
      })
      .filter((n): n is number => n !== null)
    const next = nums.length ? Math.max(...nums) + 1 : 1
    return `EMP${String(next).padStart(4, '0')}`
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm(), userid: suggestNextUserId() })
    setError(null)
    setPhoneError(null)
    setModalOpen(true)
  }

  function openEdit(user: any) {
    setEditing(user)
    setForm({
      userid: user.userid,
      name: user.name,
      company_mail: user.company_mail || '',
      phone_number: user.phone_number || '',
      username: '',
      password: '',
      role: user.roles[0] || Roles.EMPLOYEE,
    })
    setError(null)
    setPhoneError(null)
    setModalOpen(true)
  }

  function validatePhone(value: string) {
    if (!value) {
      setPhoneError(null)
      return true
    }
    const cleaned = value.replace(/[\s-]/g, '')
    if (!PHONE_PATTERN.test(cleaned)) {
      setPhoneError('Enter exactly 10 digits, optionally starting with + and a country code')
      return false
    }
    setPhoneError(null)
    return true
  }

  function validateEmail(value: string) {
    if (!value) {
      setEmailError(null)
      return true
    }
    if (!EMAIL_PATTERN.test(value.trim())) {
      setEmailError('Enter a valid email address (e.g. name@company.com)')
      return false
    }
    setEmailError(null)
    return true
  }

  async function handleSave() {
    setError(null)
    if (!validatePhone(form.phone_number)) return
    if (!validateEmail(form.company_mail)) return
    setSubmitting(true)
    try {
      if (editing) {
        await adminApi.updateUser(editing.id, {
          name: form.name,
          company_mail: form.company_mail,
          phone_number: form.phone_number,
          role: form.role,
        })
      } else {
        await adminApi.createUser({
          userid: form.userid,
          name: form.name,
          company_mail: form.company_mail,
          phone_number: form.phone_number,
          username: form.username,
          password: form.password,
          role: form.role,
        })
      }
      setModalOpen(false)
      load()
    } catch (err: any) {
      setError(toErrorMessage(err, 'Could not save user'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleDeactivate(id: number) {
    setDeactivateTarget(users.find((u) => u.id === id) || { id })
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await adminApi.deactivateUser(deactivateTarget.id)
      load()
    } catch (err) {
      notifyError(err, 'Could not deactivate this user.')
    } finally {
      setDeactivating(false)
      setDeactivateTarget(null)
    }
  }

  function openImport() {
    setImportFile(null)
    setImportError(null)
    setImportSummary(null)
    setImportModalOpen(true)
  }

  function downloadImportTemplate() {
    exportToCsv('users-import-template', [
      {
        'User ID': 'EMP0002',
        'Full Name': 'Jane Doe',
        'Company Mail': 'jane.doe@company.com',
        'Phone Number': '9876543210',
        'Login Username': 'jane.doe',
        Password: '',
        Role: 'employee',
      },
    ])
  }

  async function handleImportSubmit() {
    if (!importFile) {
      setImportError('Choose a .xlsx or .csv file to import.')
      return
    }
    setImportError(null)
    setImporting(true)
    try {
      const summary = await adminApi.importUsers(importFile)
      setImportSummary(summary)
      if (summary.created > 0) load()
    } catch (err: any) {
      setImportError(toErrorMessage(err, 'Could not import users from this file.'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage accounts and roles"
        action={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={openImport}>
              <span className="nav-icon" style={{ width: 14, height: 14 }}><Icon.Upload /></span> Import
            </button>
            <button className="btn-primary" onClick={openCreate}>
              <span className="nav-icon" style={{ width: 14, height: 14 }}><Icon.Plus /></span> New User
            </button>
          </div>
        }
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="th-row">
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">User ID</th>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Company Mail</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-muted">
                  No users yet. Create the first one.
                </td>
              </tr>
            )}
            {pagedUsers.map((u) => (
              <tr
                key={u.id}
                className={`border-b border-border last:border-0 hover:bg-slate-50 ${!u.isAlive ? 'opacity-50' : ''}`}
              >
                <td className="px-5 py-3 font-mono text-xs text-muted">{u.userid}</td>
                <td className="px-5 py-3 font-medium text-ink">{u.name}</td>
                <td className="px-5 py-3 text-slate-600">{u.company_mail || '—'}</td>
                <td className="px-5 py-3 text-slate-600">{u.phone_number || '—'}</td>
                <td className="px-5 py-3">
                  {u.roles[0] && <span className="badge bg-blue-50 text-blue-600">{u.roles[0]}</span>}
                </td>
                <td className="px-5 py-3">
                  <span className={`badge ${u.isAlive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    {u.isAlive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1">
                    <IconAction icon={<Icon.Pencil />} label="Edit" onClick={() => openEdit(u)} />
                    {u.isAlive && (
                      <IconAction icon={<Icon.Ban />} label="Deactivate" variant="danger" onClick={() => handleDeactivate(u.id)} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} totalItems={users.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit User' : 'New User'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="users-user-id" className="text-xs text-muted mb-1 block">User ID</label>
            <input id="users-user-id"
              className="input"
              value={form.userid}
              disabled={!!editing}
              onChange={(e) => setForm({ ...form, userid: e.target.value })}
              placeholder="EMP0002"
            />
          </div>
          <div>
            <label htmlFor="users-full-name" className="text-xs text-muted mb-1 block">Full Name</label>
            <input id="users-full-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="users-company-mail" className="text-xs text-muted mb-1 block">Company Mail</label>
            <input id="users-company-mail"
              className="input"
              value={form.company_mail}
              onChange={(e) => {
                setForm({ ...form, company_mail: e.target.value })
                validateEmail(e.target.value)
              }}
            />
            {emailError && <p className="text-[11px] text-red-600 mt-1">{emailError}</p>}
          </div>
          <div>
            <label htmlFor="users-phone-number" className="text-xs text-muted mb-1 block">Phone Number</label>
            <input id="users-phone-number"
              className="input"
              value={form.phone_number}
              onChange={(e) => {
                setForm({ ...form, phone_number: e.target.value })
                validatePhone(e.target.value)
              }}
              placeholder="9876543210"
            />
            {phoneError && <p className="text-[11px] text-red-600 mt-1">{phoneError}</p>}
          </div>
          {!editing && (
            <>
              <div>
                <label htmlFor="users-login-username" className="text-xs text-muted mb-1 block">Login Username</label>
                <input id="users-login-username"
                  className="input"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="users-password" className="text-xs text-muted mb-1 block">Password</label>
                <input id="users-password"
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="col-span-2">
            <label className="text-xs text-muted mb-1 block">Role</label>
            <div className="flex gap-4">
              {ROLE_OPTIONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm cursor-pointer capitalize">
                  <input
                    type="radio"
                    name="role"
                    checked={form.role === r}
                    onChange={() => setForm({ ...form, role: r })}
                  />
                  {r}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-1">Each user has exactly one role.</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Users"
        maxWidth="max-w-lg"
        footer={
          importSummary ? (
            <button className="btn-primary" onClick={() => setImportModalOpen(false)}>Done</button>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => setImportModalOpen(false)} disabled={importing}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleImportSubmit} disabled={importing}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </>
          )
        }
      >
        {!importSummary && (
          <>
            <p className="text-sm text-muted">
              Upload a .xlsx or .csv file with the same fields as the New User form: User ID, Full
              Name, Company Mail, Phone Number, Login Username, Password, Role. Column order
              doesn't matter — headers are matched by name. Leave Password blank on a row to have
              one generated automatically (that user will be required to change it on first login).
            </p>
            <button
              type="button"
              onClick={downloadImportTemplate}
              className="text-xs font-medium text-accent hover:underline"
            >
              Download a template CSV
            </button>
            {importError && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{importError}</div>}
            <div>
              <label htmlFor="users-import-file" className="text-xs text-muted mb-1 block">File</label>
              <input
                id="users-import-file"
                type="file"
                accept=".xlsx,.csv"
                className="input"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>
          </>
        )}
        {importSummary && (
          <>
            <div className="flex gap-3">
              <div className="flex-1 rounded-lg bg-emerald-50 text-emerald-600 px-3 py-2 text-sm font-medium text-center">
                {importSummary.created} created
              </div>
              <div className="flex-1 rounded-lg bg-red-50 text-red-600 px-3 py-2 text-sm font-medium text-center">
                {importSummary.failed} failed
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="th-row sticky top-0">
                  <tr className="text-left border-b border-border">
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">User ID</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {importSummary.results.map((r) => (
                    <tr key={r.row} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-slate-500">{r.row}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">{r.userid || '—'}</td>
                      <td className={`px-3 py-2 ${r.status === 'created' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.message}
                      </td>
                    </tr>
                  ))}
                  {importSummary.results.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-4 text-center text-muted">No data rows found in the file.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deactivateTarget}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
        confirming={deactivating}
        title="Deactivate this user?"
        message={`${deactivateTarget?.name || 'This user'} will no longer be able to log in. You can't undo this from here.`}
        confirmLabel="Deactivate"
        danger
      />
    </div>
  )
}
