# CRUD App

A Node.js task-management application with authentication, built as the deployable
artifact for a DevOps CI/CD assignment.

The app is intentionally small but production-shaped: it exposes the health,
metrics and build-metadata endpoints that a CI/CD pipeline, a reverse proxy and a
monitoring stack need to do their jobs.

| | |
|---|---|
| **Runtime** | Node.js 20 LTS |
| **Framework** | Express 4 |
| **Auth** | JWT in an HttpOnly cookie, bcrypt-hashed passwords |
| **Storage** | JSON file, atomic writes, no database required |
| **Tests** | 52 tests, Jest + Supertest, ~92% line coverage |
| **Observability** | Prometheus `/metrics`, JSON logs, `/healthz`, `/readyz` |
| **Public URL** | `https://devlogin.nextastra.com` (behind NGINX + Let's Encrypt) |

> **On the name.** The npm package, systemd service, `/opt` path, cookie and
> Prometheus metric prefix are all `devlogin`, matching the assignment's mandated
> hostname `devlogin.nextastra.com`. Only the user-facing branding says
> "CRUD App". Renaming the internals would mean rewriting the NGINX vhost,
> systemd unit and Prometheus alert rules for no functional gain.

---

## Features

- **Login / logout** with bcrypt-hashed credentials seeded from environment variables
- **Full CRUD** on tasks — create, list, rename, toggle complete, delete
- **Per-user data isolation** — every store call is scoped to the JWT subject
- **Dashboard UI** showing the signed-in user, live counts, and inline editing
- **Rate limiting** on the login endpoint (defence in depth alongside NGINX)
- **Prometheus metrics** — HTTP latency histogram, request/login/CRUD counters,
  Node.js heap and event-loop lag, build info
- **Graceful shutdown** on `SIGTERM` so deploys and restarts don't drop requests

---

## Project structure

```
app/
├── server.js                  Process entrypoint: binds the port, handles SIGTERM
├── package.json               Scripts, dependencies, Jest config
├── package-lock.json          Committed — `npm ci` requires it
├── .env.example               Template for local configuration
├── .eslintrc.json             Lint rules
│
├── src/
│   ├── app.js                 Express wiring: helmet, CSP, routes, static, errors
│   ├── logger.js              Single-line JSON logger (journald-friendly)
│   ├── metrics.js             Prometheus registry, custom counters, middleware
│   ├── users.js               In-memory users, bcrypt-hashed at boot
│   ├── todos.js               Task store, JSON-persisted with atomic writes
│   └── routes/
│       ├── auth.js            POST /api/login, /api/logout, GET /api/profile
│       ├── health.js          /healthz, /readyz, /api/info
│       └── todos.js           CRUD API, all behind requireAuth
│
├── public/                    Static frontend (no build step, no framework)
│   ├── index.html             Login page
│   ├── app.js                 Login logic + redirect to the dashboard
│   ├── dashboard.html         Task dashboard
│   ├── dashboard.js           CRUD logic, session guard
│   └── styles.css             Shared stylesheet
│
├── scripts/
│   └── build.js               Produces dist/ + BUILD_INFO.json for the pipeline
│
└── tests/
    ├── app.test.js            Health, auth, metrics, security headers, caching
    └── todos.test.js          CRUD, validation, per-user isolation, persistence
```

**Why `server.js` and `src/app.js` are separate:** `src/app.js` exports the
Express app without listening on a port, so the test suite can drive it in-process
via Supertest. `server.js` is the only file that binds a socket.

---

## Dependencies

### Runtime (8)

| Package | Version | Why it's here |
|---|---|---|
| `express` | 4.22.2 | HTTP framework |
| `helmet` | 7.2.0 | Security headers, including the CSP |
| `bcryptjs` | 2.4.3 | Password hashing (pure JS — no native build toolchain needed) |
| `jsonwebtoken` | 9.0.3 | Signs and verifies session tokens |
| `cookie-parser` | 1.4.7 | Reads the HttpOnly session cookie |
| `express-rate-limit` | 7.5.1 | Throttles login attempts |
| `morgan` | 1.11.0 | HTTP access logs, piped through the JSON logger |
| `prom-client` | 15.1.3 | Prometheus metrics registry and exposition |

### Development (4)

| Package | Version | Why it's here |
|---|---|---|
| `jest` | 29.7.0 | Test runner and coverage |
| `supertest` | 7.2.2 | Drives the Express app without a live port |
| `jest-junit` | 16.0.0 | Writes `reports/junit.xml` for Jenkins to publish |
| `eslint` | 8.57.1 | Linting |

**No database, no bundler, no transpiler.** State is a JSON file; the frontend is
plain HTML/CSS/JS served straight from `public/`. `bcryptjs` over `bcrypt` avoids
needing a C++ toolchain on the build agent.

---

## Prerequisites

- **Node.js ≥ 18** (developed and tested on 20.20.0) — `.env` support uses Node's
  native `--env-file`, which needs 20.6+
- **npm ≥ 9** (tested on 10.8.2)

```bash
node --version    # v20.20.0
npm --version     # 10.8.2
```

Nothing else. No database server, no Docker, no global packages.

---

## Quick start

```bash
# 1. install dependencies
npm ci                    # reproducible, uses package-lock.json
                          # (npm install also works)

# 2. create local configuration
cp .env.example .env      # then edit ADMIN_PASSWORD / DEV_PASSWORD

# 3. run
npm run start:local       # http://127.0.0.1:3000
```

Open **http://127.0.0.1:3000** and sign in with the credentials from your `.env`.
A successful login redirects to `/dashboard`.

### ⚠️ `npm start` vs `npm run start:local`

This is the single most common way to get confused here:

```bash
npm start           # does NOT read .env — the environment supplies the values
npm run start:local # reads .env via node --env-file
```

`npm start` is what systemd runs in production, where the environment comes from
`EnvironmentFile=`. If you run `npm start` locally after editing `.env`, your
changes are ignored and the built-in fallback passwords apply instead.

`start:local` and `dev` **fail with `node: .env: not found`** if the file doesn't
exist — run the `cp` first, or use plain `npm start`.

---

## npm scripts

| Script | What it does |
|---|---|
| `npm start` | Production start. Ignores `.env`. |
| `npm run start:local` | Local start, reads `.env`. |
| `npm run dev` | Same as above plus `--watch` (auto-restart on file change). |
| `npm test` | Jest with coverage. |
| `npm run test:ci` | Adds a JUnit XML reporter at `reports/junit.xml`. |
| `npm run lint` | ESLint over the whole project. |
| `npm run build` | Writes a deployable `dist/` plus `BUILD_INFO.json`. |

---

## Configuration

All configuration is by environment variable. Nothing is read from a committed file.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | See the warning below. |
| `HOST` | `127.0.0.1` | Loopback by default — NGINX fronts it. |
| `PORT` | `3000` | |
| `LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug` |
| `JWT_SECRET` | insecure fallback | **Set this.** `openssl rand -hex 32` |
| `TOKEN_TTL` | `1h` | Any `jsonwebtoken` duration string. |
| `ADMIN_USER` | `admin` | |
| `ADMIN_PASSWORD` | `ChangeMe123!` | **Change for anything public.** |
| `DEV_USER` | `developer` | |
| `DEV_PASSWORD` | `DevPass123!` | **Change for anything public.** |
| `DATA_DIR` | `./data` | Where `todos.json` lives. See below. |
| `BUILD_NUMBER` | `local` | Injected by Jenkins; surfaces at `/api/info`. |
| `GIT_COMMIT` | `unknown` | Injected by Jenkins; surfaces at `/api/info`. |

### ⚠️ `NODE_ENV` affects the session cookie

When `NODE_ENV=production`, the session cookie is marked `Secure`, so **browsers
refuse to store it over plain `http://`**. Logins appear to succeed but no session
is kept and the dashboard bounces you back to the login page.

- Local testing over HTTP → `NODE_ENV=development`
- Behind NGINX with a valid certificate → `NODE_ENV=production`

`production` also enables HSTS.

The login rate limit is **10 attempts per 15 minutes in both development and
production** — only `NODE_ENV=test` relaxes it (to 1000) so the suite can run.
The limiter is in-memory, so restarting the process clears it.

### `DATA_DIR` must live outside the release directory

Tasks are persisted to `$DATA_DIR/todos.json`. Deployment swaps a
`current -> releases/<timestamp>` symlink, so **anything written inside a release
is destroyed by the next deploy**.

```bash
# local
DATA_DIR=./data

# server
DATA_DIR=/var/lib/devlogin
```

A test asserts the data file resolves outside the application directory. If you
use a hardened systemd unit with `ProtectSystem=strict`, add
`ReadWritePaths=/var/lib/devlogin` or writes will fail with `EROFS`.

---

## API reference

Authenticated routes accept either the `devlogin_token` cookie (set by
`/api/login`) or an `Authorization: Bearer <token>` header.

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Login page |
| `GET` | `/dashboard` | Task dashboard (data requires auth) |
| `GET` | `/healthz` | Liveness — always cheap, touches nothing |
| `GET` | `/readyz` | Readiness — 503 if the heap is nearly exhausted |
| `GET` | `/api/info` | Version, commit, build number, hostname, load average |
| `GET` | `/metrics` | Prometheus exposition format |
| `POST` | `/api/login` | `{username, password}` → sets the session cookie |
| `POST` | `/api/logout` | Clears the cookie |

### Authenticated

| Method | Path | Description | Success |
|---|---|---|---|
| `GET` | `/api/profile` | Current identity | `200` |
| `GET` | `/api/todos` | List tasks (newest first) + stats | `200` |
| `POST` | `/api/todos` | Create — `{title}` | `201` |
| `PATCH` | `/api/todos/:id` | Update — `{title?, completed?}` | `200` |
| `DELETE` | `/api/todos/:id` | Delete | `200` |

Errors: `400` validation, `401` missing/invalid token, `404` unknown task id,
`429` rate limited, `500` unexpected.

### Worked example

```bash
BASE=http://127.0.0.1:3000

# log in, keeping the cookie
curl -s -c /tmp/jar -X POST $BASE/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"developer","password":"developer"}'

# CREATE
ID=$(curl -s -b /tmp/jar -X POST $BASE/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"Install Jenkins"}' | jq -r .todo.id)

# READ
curl -s -b /tmp/jar $BASE/api/todos | jq

# UPDATE — mark complete
curl -s -b /tmp/jar -X PATCH $BASE/api/todos/$ID \
  -H 'Content-Type: application/json' -d '{"completed":true}' | jq

# UPDATE — rename
curl -s -b /tmp/jar -X PATCH $BASE/api/todos/$ID \
  -H 'Content-Type: application/json' -d '{"title":"Install Jenkins LTS"}' | jq

# DELETE
curl -s -b /tmp/jar -X DELETE $BASE/api/todos/$ID | jq
```

**Validation rules:** `title` must be a non-empty string of at most 200 characters
(trimmed); `completed` must be a boolean; at most 200 tasks per user.

---

## Testing

```bash
npm test              # 52 tests, with coverage
npm run test:ci       # also writes reports/junit.xml for Jenkins
```

Current coverage: **91.6% statements, 92.1% lines, 83.2% branches**.

| Suite | Covers |
|---|---|
| `tests/app.test.js` | Health endpoints, login success/failure, protected routes, expired and malformed tokens, metrics format, security headers, static-asset cache policy |
| `tests/todos.test.js` | CRUD happy paths, every validation rule, per-user isolation, JSON persistence, metric counters |

Three tests are worth knowing about, because they encode decisions rather than
just behaviour:

- **Per-user isolation** — `developer` cannot read, rename or delete `admin`'s
  tasks. The API answers `404`, not `403`, so it never confirms that another
  user's id exists.
- **No inline `<script>`** — the CSP sets `script-src 'self'`, so an inline script
  would be silently blocked in the browser while still passing a naive
  `curl`-returns-200 check. The test asserts all page JS is external.
- **Revalidating `Cache-Control`** — a positive `max-age` on `app.js` would leave
  browsers running the *previous* release's JavaScript against the new API after
  a deploy. Assets must send `no-cache` (revalidate, cheap 304), not a long TTL.

Tests use a temporary `DATA_DIR` under the OS temp directory, so running them
never touches your local task data.

---

## Security notes

- Passwords are **bcrypt-hashed** (10 rounds) at boot; plaintext is never stored.
- Login **always runs a bcrypt comparison**, even for unknown usernames, so
  response timing doesn't reveal whether an account exists.
- Failed logins return a **deliberately vague** `Invalid credentials` for both a
  bad password and a missing user.
- The session cookie is `HttpOnly` + `SameSite=Strict`, and `Secure` in production
  — unreachable from client-side JavaScript.
- Task titles render via `textContent`, never `innerHTML`, so a title containing
  HTML is displayed literally rather than executed.
- Request bodies are capped at 10 kB.
- **`/metrics` is unauthenticated at the application level** and must be
  restricted by the reverse proxy. The NGINX vhost does this with
  `allow 127.0.0.1; deny all;` — that block is load-bearing, don't drop it.

---

## Production notes

The app expects to run behind a reverse proxy:

- It binds **loopback only** by default, so it isn't directly reachable.
- `trust proxy` is set to exactly **one hop**, making `req.ip` the real client
  address for rate limiting and logs — so NGINX must send `X-Forwarded-For`.
- It logs to **stdout/stderr as JSON lines**, for `journald` to collect. No log
  files, no rotation to configure.
- It exits cleanly on **`SIGTERM`**, draining in-flight requests with a 10-second
  hard cap.

Deployment outline:

```bash
npm ci --omit=dev                 # runtime dependencies only
npm run build                     # -> dist/ + BUILD_INFO.json

DATA_DIR=/var/lib/devlogin \
NODE_ENV=production \
  node server.js                  # normally started by systemd
```

`GET /api/info` returns the running build number and commit — the quickest way to
confirm a deploy actually replaced what was live.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid credentials` with a password you're sure about | Running `npm start`, which ignores `.env` | Use `npm run start:local` |
| `node: .env: not found` | `start:local`/`dev` require the file | `cp .env.example .env` |
| Login succeeds but you're bounced back to the login page | `NODE_ENV=production` over plain HTTP → `Secure` cookie rejected | Set `NODE_ENV=development` locally |
| UI behaves like an older version | Browser cached an old asset | Hard-refresh once (`⌘/Ctrl + Shift + R`) |
| `Too many login attempts` | Rate limit: 10 per 15 min (dev and prod alike) | Restart the process — the limiter is in-memory — or wait it out |
| `EROFS` / `EACCES` writing tasks | `DATA_DIR` not writable by the service user | `chown` it; add `ReadWritePaths=` to the systemd unit |
| Tasks vanished after a deploy | `DATA_DIR` pointed inside the release directory | Point it at `/var/lib/devlogin` |
| `EADDRINUSE` | Port 3000 already taken | `lsof -ti:3000 \| xargs kill`, or set `PORT` |

Useful commands:

```bash
curl -s localhost:3000/healthz              # is it alive?
curl -s localhost:3000/api/info | jq        # which build is running?
curl -s localhost:3000/metrics | grep devlogin_   # application metrics
journalctl -u devlogin -f                   # logs, on the server
```
