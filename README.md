# HMIS — Improved version

Hospital Management Information System.
**Stack:** React (Vite) + Tailwind · Node.js (Express) · MySQL 8 · JWT auth · RBAC.

This is a cleaned-up version of the original `hmis/` folder.

---

## Quick start (Docker for MySQL — recommended)

You need Node.js 18+, npm, and Docker Desktop.

```bash
# 1. Start MySQL (schema + seed run automatically on first boot)
cd hmis_improved
docker compose up -d

# 2. Backend API
cd server
npm install
npm run dev          # http://127.0.0.1:4000  (health: GET /health)

# 3. Frontend (in a second terminal)
cd ../client
npm install
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173` and sign in with one of the seeded accounts below.

> If you change `database/schema.sql` later, the docker volume keeps the old data.
> Reset with: `docker compose down -v && docker compose up -d`.

### Demo accounts (password = `password`)

| Role         | Email              |
|--------------|--------------------|
| Admin        | admin@hmis.local   |
| Doctor       | doc1@hmis.local    |
| Doctor       | doc2@hmis.local    |
| Receptionist | recv@hmis.local    |
| Pharmacist   | pharm@hmis.local   |
| Lab tech     | lab@hmis.local     |

---

## Quick start (local MySQL, no Docker)

```sql
CREATE DATABASE hmis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'hmis'@'%' IDENTIFIED BY 'hmis_secret';
GRANT ALL PRIVILEGES ON hmis.* TO 'hmis'@'%';
FLUSH PRIVILEGES;
```

```bash
mysql -u root -p hmis < database/schema.sql
mysql -u root -p hmis < database/seed.sql
```

Then run server + client as above. Edit `server/.env` if your credentials differ.

---

## What's different from the original `hmis/`

### Bug fixes

1. **Vite proxy port mismatch.** `client/vite.config.js` proxied `/api` to port `4009` but the API listens on `4000`. Login was broken out of the box. Fixed.
2. **Missing tables/columns at first boot.** `surgery_requests` and `bill_items.consultation_id` / `appointment_id` lived only in standalone migration files, but `docker-compose.yml` only mounted `schema.sql` + `seed.sql`. So surgery booking and doctor billing summary would crash on a fresh container. **All migrations are folded into one consolidated `database/schema.sql`** and the loose migration files are removed.
3. **React hooks-rules violations.** `PatientsPage.jsx` and `AppointmentsPage.jsx` did an early `return` for the doctor role *before* their `useState` / `useEffect` calls. That breaks React's hook-order rules and crashes on remount under StrictMode. Removed.
4. **`scheduledAt` was inconsistently normalized.** Follow-up booking stripped the `T` and trailing chars from datetime-local strings; direct booking and PATCH did not. Now consistent.
5. **`auth.js` had a try/catch** wrapping `UPDATE … last_login_at` to handle pre-G3 databases missing that column. Column is now always present in the consolidated schema, so the workaround is gone.
6. **Patient insurance fields were in the schema and API but never exposed in the UI.** Added `insuranceProvider`, `insurancePolicyNumber`, and `insuranceGroupNumber` to both the create and edit patient forms.

### Cleanup / clearer flow

- **Centralized RBAC.** Role-based redirects now live in one `RoleGate` component in `client/src/App.jsx`. Pages no longer carry per-role `if (user?.role === 'doctor') return <placeholder />` blocks. Doctors who manually navigate to `/patients` or `/appointments` get redirected to the dashboard instead of seeing a dead "not available for your role" page.
- **One schema file.** `database/migration_*.sql` and `patch_last_login_at.sql` are gone. `schema.sql` is the single source of truth.
- **Pre-filled `server/.env`** so first-time setup doesn't require a copy step. Comment in the file flags `JWT_SECRET` as dev-only — change it before deploying.
- **Docker compose healthcheck + explicit utf8mb4** so the API can reliably wait for MySQL on first boot.

### What's still hardcoded (and why it's fine)

The only static data in the codebase is `server/src/data/hmisServicesCatalog.js` and `shared/servicesCatalog.js` — these list the 38 PDF service codes (PM-1, AP-2, CW-1, etc.) used by the project's grading rubric. They are metadata describing the system itself, not user or business data. **All actual application data — patients, doctors, appointments, prescriptions, bills, inventory, ICU beds, alerts — comes from MySQL.**

---

## Project layout

```
hmis_improved/
├── client/              React + Vite + Tailwind
├── server/              Express REST API, JWT, RBAC, audit logs
├── database/
│   ├── schema.sql       Consolidated — run this first
│   └── seed.sql         Demo users, patients, sample data
├── shared/              Service catalog shared between client and server
├── docker-compose.yml   MySQL 8 with auto-init
└── README.md
```

## Tests

```bash
cd server
npm test
```

## Production build

```bash
cd client
npm run build
# Serve client/dist behind any static host. Reverse-proxy /api to the Node server.
```

## Security notes

Before deploying:
- Replace `JWT_SECRET` in `server/.env`.
- Use TLS in front of both the API and the static client.
- Restrict MySQL network access — don't expose port 3306 publicly.
- Remove the demo users in `database/seed.sql`.
- The notification "send" endpoints write to a `notifications` table; wire to a real email/SMS provider before relying on them.

---

## Pushing this back to your repo

```bash
# from your existing clone of SWE_Project_partial
unzip hmis_improved.zip                         # creates hmis_improved/
git checkout -b improved
git add hmis_improved
git commit -m "Add cleaned-up version of hmis (bug fixes, consolidated schema, RBAC cleanup)"
git push origin improved
```

Then open a PR on GitHub, or merge directly into main.
