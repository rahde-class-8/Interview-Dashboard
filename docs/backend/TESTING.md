# Testing

How the application is tested, how to run the suites, and which test proves which
requirement. Phase 8 gate: **all critical security tests pass** — see §4.

_Results below: 2026-10-25, clean `db reset`, local Supabase (CLI 2.122.0), production build._

## 1. Suites at a glance

| Layer | Tool | Location | Tests | Result |
| --- | --- | --- | --- | --- |
| Database schema, constraints, RLS, functions | pgTAP | `supabase/tests/database/` (10 files) | 505 | ✅ |
| Unit (validation, business rules, permissions, transformations, API client) | Vitest | `tests/unit/` (12 files) | 112 | ✅ |
| Integration (HTTP + RLS against local Supabase, repository secret scan) | Vitest | `tests/integration/` (2 files) | 12 | ✅ |
| API behavior, authorization matrix, Storage, Realtime, credentials | Playwright `api` | `tests/api/` (10 specs) | 55 | ✅ |
| Browser end-to-end | Playwright `chromium` | `tests/e2e/` (3 specs) | 8 | ✅ |
| Static checks | ESLint, `tsc --noEmit`, `supabase db lint`, `npm audit` | — | — | ✅ (0 vulnerabilities) |
| **Total** | | | **692** | ✅ |

## 2. Running the tests

Prerequisites: Docker running, `npm install`, `npm run supabase:start`, `npm run env:local`.

```bash
npm run test:db            # pgTAP (uses the running local database)
npm run test:unit          # Vitest unit tests (no services needed)
npm run test:integration   # Vitest integration (needs local Supabase + .env.local)
npm test                   # unit + integration
npm run test:api           # Playwright API tests (builds and starts the app on :3000)
npx playwright test        # API + browser tests
npx playwright test tests/e2e/full-workflow.spec.ts   # just the specification workflow
npm run lint && npx tsc --noEmit && npx supabase db lint && npm audit
```

* Playwright builds the production app (`npm run build && npm start`) unless a server is
  already listening on :3000 — stop any dev server first so tests run against a current
  build. Traces of failures are kept in `test-results/` (`npx playwright show-trace …`).
* Tests create their own users (`*@example.com`) with the service role and delete them
  afterwards; all test data is fictional. `npm run db:reset` gives a clean database.
* Emails (confirmation, password reset) are read from Mailpit's API (`tests/e2e/mailpit.ts`).
* The integration suites fail (not skip) when Supabase is not configured.

### Continuous integration

`.github/workflows/ci.yml` runs every suite on a GitHub runner against a local Supabase stack
(no cloud resources). It is **manual-trigger only** (`workflow_dispatch`) so it does not consume
Actions minutes without approval; add a `pull_request` trigger to run it on every PR. The
workflow has not been executed yet (this environment cannot run GitHub Actions).

## 3. Requirement traceability

### Unit tests (specification: input validation, business rules, permission helpers, data transformations)

| Requirement | Tests |
| --- | --- |
| Input validation | `tests/unit/contracts.test.ts`, `auth-contracts.test.ts`, `recordings.test.ts` (consent, formats, size), `collaboration.test.ts` (invitations, notes), `client-validation.test.ts` (browser checks) |
| Business rules | `tests/unit/business-rules.test.ts` (dashboard metrics, overdue rules, call follow-ups, intelligence aggregation, call rows, store cascades), `recordings.test.ts` (audio signatures, size limits), `collaboration.test.ts` (invitation expiry, tokens) |
| Permission helpers | `tests/unit/permissions.test.ts` (role ranks, per-role capabilities, recording deletion, comment edit/delete) |
| Data transformations | `tests/unit/mappers.test.ts` (API → UI), `api-core.test.ts` (error mapping, pagination, search escaping), `collaboration.test.ts` (activity summaries), `api-client.test.ts` (error envelopes, retries, pagination) |
| Auth error messages | `tests/unit/auth-errors.test.ts`, `safe-redirect.test.ts` |

### Integration tests (database operations, authentication, workspace access, recording metadata, storage authorization, API behavior)

| Requirement | Tests |
| --- | --- |
| Database operations | pgTAP `002`–`005` (identity, relationships, constraints, recordings), `008` (transactional services), `009` (storage lifecycle, quotas, maintenance), `010` (collaboration triggers) |
| Authentication | `tests/e2e/auth.spec.ts` (register, confirm, sign in/out, reset, HttpOnly/Secure/SameSite cookies, no account enumeration), `tests/api/access.spec.ts` (JSON 401) |
| Workspace access | pgTAP `006_rls_matrix` (10 tables × 5 roles × 4 operations + anon on every table), `007`; `tests/integration/rls-http.test.ts`; `tests/api/security.spec.ts` (every route) |
| Recording metadata | pgTAP `005`, `009`; `tests/api/recordings.spec.ts` |
| Storage authorization | pgTAP `009` (private bucket, no object policies); `tests/api/recordings.spec.ts` ("Storage itself refuses direct access…", path-bound tokens, playback roles) |
| API behavior | `tests/api/*.spec.ts` — every endpoint, validation, pagination, errors, CSRF/body limits, Realtime |

### End-to-end (specification §12 workflow)

`tests/e2e/full-workflow.spec.ts` follows the specification step by step through the UI:

| Step | Covered by |
| --- | --- |
| 1. Register and log in | Registration form → Mailpit confirmation link → sign out → sign in |
| 2. Create an opportunity | Opportunity dialog (company, title, location, compensation) |
| 3. Add a recruiter call | Call form linked to the opportunity, new recruiter with agency |
| 4. Save structured notes | Priorities, interview stages, advice, topics, themes, red flags, candidate Q&A, follow-up, full notes |
| 5. Upload an existing audio file | Consent checkbox → upload → server verification |
| 6. Play the recording | Signed playback URL; the bytes served equal the uploaded file |
| 7. Create interview preparation tasks | Two tasks, one completed |
| 8. Log out | Protected page redirects to sign-in afterwards |
| 9. Log back in | Sign-in form |
| 10. Verify data persists | Opportunity, structured call fields, follow-up, notes, recording (playable), task states |
| 11. Unauthorized account cannot access it | Second account: call and opportunity pages show "not found", list is empty, direct API calls with the owner's ids return 404 (including playback URL) |

Additional browser workflows: `tests/e2e/workflows.spec.ts` (invalid upload rejected in the UI,
invitation by link, read-only viewer interface, live updates, role change, note conflict).

## 4. Security tests (specification list — all must pass)

| Requirement | Tests | Result |
| --- | --- | --- |
| Unauthorized users cannot access another workspace | `security.spec.ts` "users cannot access another workspace through any route" (all 75 workspace routes → 404, plus foreign ids inside the user's own workspace); pgTAP `006` (outsider row in the matrix); `rls-http.test.ts`; `full-workflow.spec.ts` step 11 | ✅ |
| Viewers cannot edit records | `security.spec.ts` "viewers are denied every route above their role" (every mutation → 403, every read → 200); pgTAP `006`; `access.spec.ts`; `workflows.spec.ts` (read-only UI) | ✅ |
| Commenters cannot upload recordings | `security.spec.ts` "commenters cannot upload recordings or edit records, but can comment" and the commenter matrix; `recordings.spec.ts` "enforces workspace roles…" | ✅ |
| Expired or revoked invitations cannot be reused | `collaboration.spec.ts` "revoked and expired invitations cannot be used", "…single-use and bound to the email"; pgTAP `007`, `010` | ✅ |
| Storage access is denied without permission | `recordings.spec.ts` "Storage itself refuses direct access without a server-signed URL" (signed-in owner cannot download/list/sign/upload/delete; public URL fails; upload token bound to its path), viewer/commenter playback 403; pgTAP `009` (no `storage.objects` policies, private bucket); `full-workflow.spec.ts` step 11 | ✅ |
| Invalid uploads are rejected | `recordings.spec.ts` "rejects unsupported, oversized and unconsented uploads…", "marks invalid uploads failed and removes the object"; `workflows.spec.ts` (fake file in the UI); pgTAP `009` (size limit, quota, per-call limit) | ✅ |
| Privileged credentials are never exposed | `security.spec.ts` "the served application never exposes privileged credentials" (every JS chunk of the build + served pages: no secret key, no cron secret, no service-role JWT, no secret variable names) and "API responses never contain secrets or storage internals"; `tests/integration/repository-secrets.test.ts` (no committed `.env` files, secret values or credential-shaped strings); `auth.spec.ts` (HttpOnly session cookies) | ✅ |

Also covered: unauthenticated access to every route (401), route coverage guard (a new route
without an authorization entry fails the suite), security headers, CSRF/origin and body-size
limits (`access.spec.ts`), SQL/filter injection in search (`access.spec.ts`), rate limits and
quotas (`recordings.spec.ts`, pgTAP `009`), Realtime channel authorization (`collaboration.spec.ts`,
pgTAP `010`), cron-secret protection of the maintenance job.

## 5. Writing new tests

* **New API route** → add it to `MATRIX` in `tests/api/security.spec.ts` (the guard test fails
  until you do) and add behavior tests in the feature spec.
* **New table** → enable and force RLS, add policies and grants, and extend pgTAP `006` (the
  schema test fails for tables without forced RLS).
* **New UI workflow** → a Playwright test in `tests/e2e/`; prefer role/label selectors.
* Use fictional data only; create users through the helpers and delete them afterwards.

## 6. Not covered (known gaps)

* Load and performance testing.
* Cross-browser runs (Chromium only) and automated accessibility audits (components follow
  accessible patterns and tests use role/label selectors, but there is no axe scan yet).
* Code-coverage reporting (no coverage tool configured).
* Hosted-environment tests (staging/production) — Phase 9.
