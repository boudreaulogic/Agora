# Agora — Deployment Bring-Up & Security-Gate Fixes (Session Update)

> **Continues from:** `SECURITY_REMEDIATION.md` (Sprint 1–2, PRs #1–#16) and `AGORA_SECURITY_AUDIT_v2.md` (master worklist).
> **Date:** 2026-06-25 · **PR:** #28 (squash-merged to `main` as `8800391f`)
> **Stack:** Next.js 14.2.35 (App Router), next-auth v5.0.0-beta.30, Prisma 5.22 / PostgreSQL 16, Docker Compose, Cloudflare Tunnel.
> **Context:** Bringing the post-security-sprint build live in Docker for the first time surfaced three deployment-blocking defects — two infra, one a **regression in the P0-1 auth gate**. All three are fixed, merged, and verified running on the host. Read this top-to-bottom before the next sprint.

---

## 1. Summary

The security-sprint code (PRs #1–#16) had **never successfully booted in the production Docker image** — the container was crash-looping, so the hardened auth path was effectively untested in prod. This session got the image to build, start, auto-migrate, and serve an authenticated session end-to-end. Three defects were found and fixed in a single PR (#28).

| # | Severity | Symptom | Layer |
|---|----------|---------|-------|
| 1 | Blocker | `su: can't set groups: Operation not permitted` → container crash-loop | Docker / runtime |
| 2 | Blocker | `Cannot find module '@prisma/engines'` → migrations never applied | Docker / Prisma |
| 3 | **Blocker + security regression** | `ERR_TOO_MANY_REDIRECTS` after login (infinite `/login ⇄ /` loop) | Auth middleware |

---

## 2. Fixes (PR #28)

### ✅ B-1 · Container ran as root but couldn't drop privileges → crash-loop
**Was:** `docker-entrypoint.sh` started as root, ran `chown -R nextjs:nodejs /app/uploads`, then `su -s /bin/sh nextjs -c "node server.js"` to drop privileges. But the `web` service in `docker-compose.yml` is hardened with `cap_drop: ALL` + `no-new-privileges: true`, which strips `CAP_CHOWN`, `CAP_SETUID`, and `CAP_SETGID`. So:
- `chown` → `Operation not permitted` (noisy, harmless)
- `su` → `can't set groups: Operation not permitted` → **`node server.js` never executed → container exited → restart loop**

**Fix:** Run the container directly as the unprivileged user (`USER nextjs` in the Dockerfile). Removed the `chown`/`chmod`/`su` dance from the entrypoint — it now `exec node server.js` directly. The `uploads-data` named volume is already initialised `nextjs:nodejs` from the image, so no runtime `chown` is needed. This also makes the security posture self-consistent: no elevated capabilities are required at all.
**Files:** `Dockerfile`, `docker-entrypoint.sh`.

### ✅ B-2 · Prisma migrate deploy missing its engine
**Was:** The production stage copied the `prisma` CLI (`node_modules/prisma`) but not its runtime dependency `@prisma/engines`. On startup the entrypoint died with `Cannot find module '@prisma/engines'`, so `prisma migrate deploy` never ran and pending migrations were silently skipped (operators had been applying them by hand via `psql`).
**Fix:** `COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma`. The entire `@prisma/*` scope is self-contained — every package (`engines`, `engines-version`, `fetch-engine`, `get-platform`, `debug`) depends only on other `@prisma/*` packages — so one copy resolves the whole runtime tree.
**Files:** `Dockerfile`.
**Result:** Auto-migration on startup now works for the first time. Confirmed applied: `20260624000001_add_user_sessions`, `20260624000002_approval_token_no_default`, `20260625000001_mfa_code_hardening`, `20260625000002_automation_webhook_secret`.

### ✅ B-3 · Auth middleware couldn't read the session token → redirect loop  *(regression in P0-1)*
**Was:** The private-by-default global gate (P0-1, `middleware.ts`) validated the session cookie with `jose.jwtVerify(token, secret)`. That only verifies a **signed JWS**. next-auth v5 stores the session as an **encrypted JWE** (`A256CBC-HS512`, salted with the cookie name) — no custom `encode`/`decode` is configured, so the default encryption is in force. `jwtVerify` therefore **threw on every authenticated request**, and the catch block redirected to `/login`.

The loop:
1. Login succeeds → session cookie set → redirect to `/`.
2. `GET /` → middleware → `jwtVerify` throws on the JWE → redirect `/login`.
3. `GET /login` → page calls `auth()`, which **decrypts the cookie correctly**, sees the user → redirect `/`.
4. → step 2, forever → `ERR_TOO_MANY_REDIRECTS`.

The smoking gun was the asymmetry: `auth()` could read the token but the middleware could not — same cookie, wrong primitive (signature-verify vs decrypt).

**Why it slipped through:** the gate was added during the sprint but the container never booted in prod, so the authenticated path was never exercised against a real JWE cookie until now.

**Fix:** Decode with `getToken()` from `next-auth/jwt`, which decrypts the JWE and handles the v5 detail that the **encryption salt equals the cookie name**. Called per candidate cookie (primary `__Host-next-auth.session-token`, then the transitional fallbacks) with matching `cookieName` + `salt`. MFA enforcement (`token.mfaRequired` / `token.mfaVerified`) is preserved unchanged.
**Files:** `middleware.ts`.

---

## 3. Verification performed (on host)

- ✅ `docker compose ... build --no-cache web` completes; production stage now shows the `@prisma` COPY step.
- ✅ Container starts and stays up — no `su`/`chown`/`crash-loop`.
- ✅ `prisma migrate deploy` runs from the entrypoint; `_prisma_migrations` shows all four sprint migrations applied 2026-06-25 17:27 UTC.
- ✅ Login at `https://app.boudreaulogic.com` succeeds and lands in the app — no redirect loop.
- ✅ `tsc --noEmit` clean.

**Still to spot-check by hand (auth gate now live for the first time):**
- Navigate several protected pages (tables, insights, admin) — confirm no spurious bounces to `/login` now that the middleware runs `getToken` on every request.
- If MFA is enabled on an account, walk `/verify-mfa` end-to-end (same decoded-token path).

---

## 4. Carry-over for the next security sprint

- **§3A-A (X-Forwarded-For trust) is started but unmerged.** A stale branch `fix/xff-trust-order` holds **1 commit not on `main`** and is ~36 commits behind. This is the HIGH item: IP-keyed throttles (login limiter, `/api/auth/mfa`, account lockout) and audit-log IPs must read `CF-Connecting-IP` behind Cloudflare, not attacker-prependable raw `X-Forwarded-For`. Decide: rebase + finish, or discard and redo on current `main`.
- **B-3 implies an audit task:** anywhere else in the codebase that hand-validates the session token should use `getToken()`/`auth()`, never `jose.jwtVerify` — grep for `jwtVerify` to confirm `middleware.ts` was the only site.
- **Cosmetic:** both compose files still carry the obsolete `version: '3.8'` key (Compose v2 warns and ignores it). Safe to delete.
- The remaining `AGORA_SECURITY_AUDIT_v2.md` §3 items (B–N: WS server audit, session-revocation enforcement on `/api/*`, audit hash-chain anchoring, Postgres hardening, SSRF DNS-rebinding TOCTOU, etc.) are **unchanged** by this session.

---

## 5. Files changed this session

| File | Change |
|------|--------|
| `Dockerfile` | `USER nextjs`; `COPY @prisma`; comment updates |
| `docker-entrypoint.sh` | Drop `chown`/`chmod`/`su`; `exec node server.js` directly |
| `middleware.ts` | Replace `jose.jwtVerify` with `getToken()` JWE decode (per-cookie, salt = cookie name) |
