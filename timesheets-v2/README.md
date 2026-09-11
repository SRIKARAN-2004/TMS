### Gitthub Link https://github.com/SRIKARAN-2004/TMS

# Timesheet Tracking Application

Full-stack timesheet app with role-based dashboards (Admin / Manager / Employee):

- **Backend:** FastAPI, MVC-style architecture, MySQL (via SQLAlchemy), Alembic migrations,
  cookie-based JWT auth, role-protected routes, custom exception hierarchy, file logging.
- **Frontend:** React + TypeScript + Vite, styled with a hand-written CSS utility layer (no
  Tailwind build step).

This project runs directly on your machine against a local MySQL server — there is no Docker
setup or container tooling involved.

## Prerequisites

- Python 3.11+
- Node.js 18+
- MySQL 8.0+ running locally (or reachable over the network)

## Quick Start

**1. Set up the backend** (see [Backend setup](#2-backend-setup) for details):

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env              # then fill in DB_PASSWORD and JWT_SECRET_KEY
alembic upgrade head
python seed_db.py
```

**2. Set up the frontend:**

```bash
cd frontend
npm install
```

**3. Run both together from the project root:**

```bash
npm install
npm run dev
```

This uses `concurrently` to start the FastAPI backend (`uvicorn --reload` on port 8000) and
the Vite dev server (port 5173) in one terminal, each with its own labeled, color-coded output.
On Windows, edit the root `package.json`'s `dev:backend` script to activate `venv\Scripts`
instead of `venv/bin` (a `dev:backend:unix` variant is included for reference).

Prefer running each side by hand in separate terminals? See sections 2 and 3 below — the root
`npm run dev` script is just a convenience wrapper around the same two commands.

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000 (interactive docs at `/docs`)
- First login: **username `admin`, password `Admin@123`** (change it from Settings after
  logging in)

## Recent changes

- **Docker removed:** the project no longer ships a `Dockerfile`, `docker-compose.yml`, or
  entrypoint script. Everything now runs with a local Python virtual environment and `npm`
  against a MySQL instance you provide — see Quick Start above.
- **Admin → Users:** the Reset Password action has been removed from the Actions column.
  Password resets are no longer part of the admin user-management flow.
- **Admin → Time Logs:** Actions are now limited to **Edit** and **Delete** for every entry.
  Approve/Reject controls have been removed from this page — reviewing pending time logs is a
  manager responsibility, not an admin one.
- **Manager → Time Logs:** Actions now correctly show **Approve**, **Edit**, and **Delete**
  for entries across the manager's team (previously Edit/Delete only worked on the manager's
  own rows, and Approve/Reject only worked on everyone else's — both were fixed so the full
  set of actions is available on the entries a manager is actually allowed to act on). Reject
  remains available alongside Approve for pending entries.
- **Employee → Time Logs:** Actions show **Edit** and **Delete** while an entry is still
  pending, and the reviewed **status** once it isn't — unchanged in behavior, but a layout fix
  (below) resolves cases where the Actions column or the Log Time modal weren't fully visible.
- **Layout fix:** the main content area no longer centers itself in a fixed-width column on
  wide screens. Pages now use the full width available next to the sidebar, so content is
  flush against the left edge instead of appearing to float in the middle of the window.
- **Modal fix:** dialogs (Log Time, Edit User, etc.) now cap their height and scroll
  internally on shorter viewports, instead of overflowing past the bottom of the screen where
  fields or the Save button could be unreachable.

## 1. Database

This project uses **Alembic** for schema migrations — see `backend/MIGRATIONS.md` for full
details (including notes for anyone upgrading from a pre-Alembic copy of this project).

**Brand new database:**

```sql
CREATE DATABASE timesheets_v2 CHARACTER SET utf8mb4;
```

Then, from `backend/`, apply the migrations:

```bash
alembic upgrade head
```

This creates every table (`Users`, `Roles`, `Role_Assignments`, `Manager_Assignments`,
`Projects`, `Project_Assignments`, `Tasks`, `Time_Logs`, `Audit_Log`, `Revoked_Tokens`) with
the current schema. The backend also runs `Base.metadata.create_all()` on startup as a safety
net, but it will **not** alter existing tables — always prefer `alembic upgrade head`.

## 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copy `backend/.env.example` to `backend/.env` and fill in your real MySQL credentials and a
random `JWT_SECRET_KEY`:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=timesheets_v2

JWT_SECRET_KEY=change_this_to_a_long_random_string
FRONTEND_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
```

Generate a strong `JWT_SECRET_KEY` with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Apply migrations, then **seed the first admin login** (your tables are empty right now, so you
need at least one way in):

```bash
alembic upgrade head
python seed_db.py
```

This creates the `admin`, `manager`, `employee` rows in `Roles`, and one admin user:
- username: `admin`
- password: `Admin@123`

**Run the API:**

```bash
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive Swagger docs of every endpoint. Logs are
also written to `backend/logs/app.log` (rotating, 5MB per file, 3 backups kept).

## 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`. It talks to the API at the URL in `frontend/.env`
(`VITE_API_BASE_URL`) — copy `frontend/.env.example` first, and make sure the URL matches
whichever port `uvicorn` is actually running on.

## 4. How auth + protected routes work

- `POST /auth/login` checks the `Passwords` table (bcrypt-hashed), and sets the JWT as an
  **httpOnly cookie** on the response — not returned for the frontend to store manually. This
  means the token is never readable by JavaScript (protects against XSS token theft).
- The frontend's axios client (`frontend/src/api/client.ts`) sends `withCredentials: true` so
  the browser automatically attaches that cookie to every request. There's no token in
  `localStorage`.
- On app load, the frontend calls `GET /auth/me` to check for an existing valid session,
  since there's nothing stored locally to check instead.
- `POST /auth/logout` clears the cookie server-side (JS can't delete an httpOnly cookie itself).
- Every backend route except `/auth/login` depends on `get_current_user` (reads + validates
  the cookie, falls back to an `Authorization: Bearer` header for Swagger/API testing) and most
  also depend on `require_roles(...)` — see `backend/app/dependencies/auth.py`.
- On the frontend, `<ProtectedRoute allowedRoles={[...]}>` wraps each role's routes. No session
  → redirect to `/login`. Wrong role for that specific page → **hard redirect** (full page
  reload) back to `/login`, not a silent client-side swap to a different page.
- Business-logic errors (not found, conflict, permission denied, etc.) are raised as custom
  exceptions (`backend/app/core/exceptions`) and converted to consistent JSON by a single
  handler in `main.py` — see that file for the full list.

## 5. Project structure (MVC + repository layer)

```
backend/
  app/
    models/          # SQLAlchemy models - one-to-one with your SQL schema
    schemas/         # Pydantic request/response shapes
    repositories/    # Raw DB queries only, no business logic
    controllers/     # Business logic ("services") - calls repositories, raises exceptions
    routes/          # HTTP layer - admin_routes / manager_routes / employee_routes / auth_routes
    dependencies/    # get_current_user, require_roles (route protection)
    core/            # config, JWT + password hashing, exceptions, logging setup
    db/              # SQLAlchemy engine/session (pinned to UTC for MySQL)
  migrations/        # Alembic migration scripts (see MIGRATIONS.md)
  logs/              # app.log (gitignored, created automatically)
  seed_db.py
  requirements.txt

frontend/
  src/
    pages/admin/     # Dashboard, Users, Roles, Projects, Tasks, TimeLogs, Reports, Settings
    pages/manager/   # Dashboard, Projects, Tasks, TimeLogs, Reports, Settings (profile-style)
    pages/employee/  # Dashboard, MyProjects, TimeLogs, Profile
    components/      # Layout, Modal, ConfirmDialog, PageHeader, ProtectedRoute,
                      # ProjectViewModal, TimeLogFormModal (shared across all 3 roles)
    context/         # AuthContext (session state, restored via /auth/me)
    api/             # client.ts (axios + cookie auth), auth.ts, roles.ts
    lib/             # exceptions.ts (frontend error types), export.ts (CSV export)
```

## 6. What's implemented per role

- **Admin:** full CRUD on users (single role per user), projects, tasks (create + delete),
  time logs (edit/delete on *any* entry), Reports page with CSV export, role catalog view.
- **Manager:** CRUD on their own projects' tasks, view of their team (direct reports +
  project teammates), full time-log actions for their team (log on behalf of a team member,
  approve/reject pending entries, edit/delete any entry in their scope), Reports page scoped
  to their own projects, profile-style read-only account page.
- **Employee:** view assigned project (max one at a time), log their own time, edit/delete
  their own entries while still pending, read-only profile.

## 7. Business rules worth knowing

- **One employee, one project at a time.** Assigning an employee already on another project
  is rejected with a clear error, not silently moved (silently moving them would make their
  logged history vanish from the wrong manager's view). Managers are not restricted this way.
- **Standard vs Overtime is computed automatically**, not manually chosen — over 8 hours in a
  single entry is always overtime, regardless of what a client sends. See
  `time_log_service.py`'s `_compute_type`.
- **Manager time-log visibility** is based on two things: direct reports (`Manager_Assignments`)
  and the log's own `project_id` matching one of the manager's assigned projects — deliberately
  *not* based on the employee's *current* project assignment, so historical logs don't
  disappear if someone gets reassigned later. The same scope determines which entries a
  manager can approve, reject, edit, or delete.
- **Employees can only edit/delete their own entries while pending** — once a log has been
  approved or rejected, it's locked from the employee's side and only Admin or the reviewing
  Manager can change it further.

## 8. Known gaps to fill in as you go

- No self-service password reset flow for users who forget their credentials.
- No pagination on list endpoints (fine for a class/portfolio project; add `limit`/`offset` if
  your data grows).
- No refresh-token flow — sessions expire after 8 hours and require a fresh login (no silent
  renewal).
