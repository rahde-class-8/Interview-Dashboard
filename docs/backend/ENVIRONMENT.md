# Local Backend Environment

How to run the local Supabase backend (PostgreSQL, Auth, Storage, Realtime, Studio)
for the Recruiter Call + Interview Intelligence Dashboard.

Status: **verified on 2026-10-24** in the project's cloud development container
(Ubuntu 24.04.5 LTS, x86_64). See §10 for the limitations found there. Staging and
production environments are **not** configured yet (see `DEPLOYMENT.md`, a later phase).

---

## 1. Prerequisites

| Tool | Required | Verified version | Check |
| --- | --- | --- | --- |
| Linux (any distribution with Docker support), macOS, or Windows + WSL2 | — | Ubuntu 24.04.5 LTS | `cat /etc/os-release` |
| Node.js | 20 or newer | 22.22.0 | `node -v` |
| npm | 10 or newer | 10.9.4 | `npm -v` |
| Git | any recent | 2.43.0 | `git --version` |
| Docker Engine | 24 or newer | 29.9.1 | `docker --version` |
| Docker Compose plugin | v2 or newer | v5.6.0 | `docker compose version` |
| Supabase CLI | pinned project dev dependency | 2.122.0 | `npx supabase --version` |
| Free disk space | ~8 GB for images and volumes | — | `df -h` |
| Free ports | 54320–54329, 3000 | — | §9.2 |

The Supabase CLI is installed **per project** (`devDependencies`, exact version), so
`npm install` gives everyone the same version. Always run it through `npx supabase …`
or the npm scripts below — no global install is needed.

## 2. Docker installation and verification

### 2.1 Install (only if missing)

Use the official method for your distribution — do not assume Ubuntu:

| Distribution | Official method |
| --- | --- |
| Ubuntu / Debian | Docker's apt repository: <https://docs.docker.com/engine/install/ubuntu/> (or `/debian/`) — packages `docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin` |
| Fedora / RHEL / CentOS Stream | Docker's dnf repository: <https://docs.docker.com/engine/install/fedora/> (or `/rhel/`, `/centos/`) |
| Arch Linux | `sudo pacman -S docker docker-compose` |
| macOS / Windows | Docker Desktop (Windows: enable the WSL2 backend) |

Installing system packages and changing group membership are privileged changes —
review the commands before running them.

### 2.2 Start the daemon

```bash
sudo systemctl enable --now docker   # systemd hosts
# Hosts without systemd (e.g. some containers):  sudo dockerd > /tmp/dockerd.log 2>&1 &
```

### 2.3 Allow your user to run Docker (optional)

```bash
sudo usermod -aG docker "$USER"   # grants root-equivalent access to the Docker daemon
newgrp docker                     # or log out and back in
```

Only do this on a machine you control; membership in the `docker` group is equivalent
to root access. Alternatively keep using `sudo docker`.

### 2.4 Verify

```bash
docker info --format '{{.ServerVersion}}'   # daemon reachable
docker run --rm hello-world                 # can pull and run a container
docker compose version                      # Compose plugin present
```

## 3. Supabase CLI setup

Already done in this repository; for reference:

```bash
npm install --save-dev --save-exact supabase@2.122.0   # pinned CLI
npx supabase init                                       # only if supabase/config.toml does not exist
```

Project layout:

```text
supabase/
├── config.toml        # local stack configuration (project_id "interview-dashboard")
├── migrations/        # versioned SQL migrations (see DATABASE.md)
├── tests/database/    # pgTAP tests (npm run test:db)
├── .gitignore         # ignores .temp/, .branches/, local env files
└── .temp/             # CLI runtime cache — contains local keys, never committed
```

`supabase init` must not be re-run over an existing configuration.

## 4. Starting local services

```bash
npm install                 # first time
npm run supabase:start      # = npx supabase start   (first run pulls ~3–4 GB of images)
npm run supabase:status     # = npx supabase status  (prints URLs and local keys)
npm run env:local           # writes .env.local from `supabase status`
npm run supabase:check      # verifies Next.js env + endpoint reachability
npm run dev                 # Next.js on http://localhost:3000 (use localhost — it is the Auth site_url)
```

### 4.1 Local service addresses

| Service | Address | Notes |
| --- | --- | --- |
| API gateway (Kong) | `http://127.0.0.1:54321` | Entry point for REST, Auth, Storage, Realtime |
| REST (PostgREST) | `http://127.0.0.1:54321/rest/v1` | |
| Auth (GoTrue) | `http://127.0.0.1:54321/auth/v1` | health: `/auth/v1/health` |
| Storage | `http://127.0.0.1:54321/storage/v1` | S3 protocol: `/storage/v1/s3` |
| Realtime | `ws://127.0.0.1:54321/realtime/v1` | |
| GraphQL | `http://127.0.0.1:54321/graphql/v1` | not used by the app |
| PostgreSQL 17 | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | local-only default credentials |
| Shadow DB (migrations diff) | port `54320` | internal |
| Connection pooler | port `54329` | disabled in config |
| Studio | `http://127.0.0.1:54323` | |
| Mail catcher (Mailpit) | `http://127.0.0.1:54324` | captures Auth emails locally (confirmation and reset links); E2E tests read its API |

Local keys (publishable, secret, legacy anon/service-role JWTs, JWT secret) are
well-known development defaults generated by the CLI. They are not secrets of any real
project, but treat them as secrets anyway: never paste them into issues, logs or docs.

### 4.2 Test commands

```bash
npm run test:db            # pgTAP database tests (schema, relationships, RLS matrix)
npm run test:unit          # Vitest unit tests
npm run test:integration   # Vitest tests against the local Supabase HTTP API
npm run test:api           # Playwright API project: HTTP tests of /api/v1 with real sessions
npm run test:e2e           # Playwright: builds, starts on :3000, runs API + browser tests (uses Mailpit)
```

Playwright uses the preinstalled Chromium matching `@playwright/test` 1.56.1
(`PLAYWRIGHT_BROWSERS_PATH`); on a new machine run `npx playwright install chromium` once.

## 5. Environment variables

`.env.example` (committed) documents every variable; `.env.local` (git-ignored, created
with mode `600` by `npm run env:local`) holds local values.

| Variable | Exposure | Purpose | Local value |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | Supabase gateway URL | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser | Publishable (anon-level) key; access limited by RLS | from `supabase status` |
| `NEXT_PUBLIC_MAX_RECORDING_SIZE_MB` | Browser + server | Recording size limit (UI and API); can only lower the 100 MiB hard limit | `100` |
| `SUPABASE_SECRET_KEY` | **Server only** | Secret (service-role-level) key; bypasses RLS. Used only by `src/server/core/supabase/admin.ts` (signed Storage URLs, recording status changes, jobs) | from `supabase status` |
| `SUPABASE_DB_URL` | **Server only** | Direct Postgres URL for tooling and tests | local default |
| `CRON_SECRET` | **Server only** | Bearer secret for `/api/internal/jobs/*` (≥ 32 chars). Jobs answer `404` while unset | generated by `npm run env:local` |
| `APP_URL` | Server only | Optional origin for invitation links (`<APP_URL>/invite/<token>`); defaults to the request origin | unset |

Rules:

- Anything prefixed `NEXT_PUBLIC_` is inlined into the browser bundle — never put
  secret or service-role keys there. `npm run supabase:check` fails if a
  `NEXT_PUBLIC_*` variable name contains `SECRET` or `SERVICE_ROLE`.
- `scripts/write-local-env.mjs` refuses to write values that do not point at
  `127.0.0.1`/`localhost`, so it cannot accidentally target a hosted project.
- No hosted (staging/production) project is linked; do not run `supabase link` until
  those environments are approved.

## 6. Stopping and restarting

```bash
npm run supabase:stop        # stops containers, KEEPS data volumes
npm run supabase:start       # starts again with the same data
```

⚠️ `npx supabase stop --no-backup` **deletes** the local database and storage volumes.
`npx supabase db reset` rebuilds the database from migrations (+ `supabase/seed.sql`) and
**discards local data**. Use either only when you intend to wipe local data.

## 7. Supabase Studio

Open <http://127.0.0.1:54323>. It connects to the local database automatically (no login).
Use it to browse tables, run SQL, inspect Auth users and Storage buckets. Schema changes
must still be captured as migrations in `supabase/migrations/` — never rely on edits
made only in Studio.

## 8. Logs

```bash
npx supabase status                                   # which services are running
docker ps --filter name=interview-dashboard           # container health
docker logs -f supabase_auth_interview-dashboard      # Auth
docker logs -f supabase_db_interview-dashboard        # Postgres
docker logs -f supabase_storage_interview-dashboard   # Storage
docker logs -f supabase_kong_interview-dashboard      # API gateway (request log)
docker logs -f supabase_realtime_interview-dashboard  # Realtime
```

Container names follow `supabase_<service>_<project_id>`. Studio's log explorer
(analytics service) is also available at <http://127.0.0.1:54323>.

## 9. Troubleshooting

### 9.1 Docker daemon not running

`Cannot connect to the Docker daemon` / `docker.sock: no such file` → start it
(`sudo systemctl start docker`, or `sudo dockerd &` without systemd) and re-check
with `docker info`.

### 9.2 Port already in use

```bash
ss -ltnp | grep -E ':(5432[0-9]|3000)\b'     # or: sudo lsof -i :54321
```

Stop the conflicting process, or change the ports in `supabase/config.toml`
(`[api] port`, `[db] port`, `[studio] port`, …) and re-run `npm run env:local`.
Another Supabase project running locally also conflicts — stop it with
`npx supabase stop --project-id <id>`.

### 9.3 Image pull failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| `429 Too Many Requests` from `registry-1.docker.io` | Docker Hub anonymous pull limit (per IP) | `docker login` (free account raises the limit), or wait and retry |
| `Data limit exceeded` / `Forbidden` from `public.ecr.aws` or its CDN | Network policy / proxy blocks ECR blob downloads | Allow ECR public and its CDN in the network policy |
| `Forbidden` from `pkg-containers.githubusercontent.com` | GHCR blob host blocked | Allow the host |

The CLI tries ECR, then GHCR, then Docker Hub for each image. Already-pulled images are
reused, so re-running `npm run supabase:start` after a partial pull only fetches what is missing.

### 9.4 A single service fails to start

```bash
npx supabase start -x mailpit      # start without an optional service (-x accepts a comma-separated list)
docker logs supabase_<service>_interview-dashboard
```

### 9.5 `supabase:check` fails

- `NEXT_PUBLIC_SUPABASE_URL is not set` → run `npm run env:local`.
- `ECONNREFUSED` → local Supabase is not running (`npm run supabase:start`).
- After changing ports or restarting with new keys, re-run `npm run env:local` and
  restart `next dev` (Next.js reads env files at startup).

### 9.6 "Edge Runtime file descriptor limit lowered"

Informational: the host's `ulimit -Hn` is below 65536. Harmless for this project (no Edge
Functions). Raise the limit only if Edge Functions are added later.

## 10. Known environment limitations (as verified)

1. **Image pulls are unreliable in the cloud container.** ECR public and GHCR blob hosts
   are blocked by its network policy, so every image came from Docker Hub, which
   rate-limits anonymous pulls (`429`). The Mailpit image only succeeded on the 6th retry
   (one minute apart); until then the stack ran with `-x mailpit`. All 12 services now
   start. On a new machine, `docker login` avoids the rate limit. Email confirmation is
   disabled locally (`enable_confirmations = false`), so sign-up works even without Mailpit.
   `imgproxy` (image transformation) and the connection pooler are disabled in `config.toml`,
   so they appear under "Stopped services" by design.
2. **Requests without an API key reach PostgREST as `anon`** through the local gateway
   (the REST root returned `200` with no key). Production gateways require a key, but
   either way the `anon` role must be denied by Row Level Security — this is a test
   requirement for the database/security phases.
3. **Storage file size limit** defaults to `50MiB` in `supabase/config.toml`, while the UI
   allows 100 MB. It will be aligned when recording storage is implemented (decision D5).
4. The cloud container uses cgroup v1 and no systemd; the Docker daemon was started
   manually with `dockerd`. On a normal Linux workstation use `systemctl`.
5. Staging and production Supabase projects and Vercel environments are **not** created
   (requires approval; `api.supabase.com` is also unreachable from the cloud container).
