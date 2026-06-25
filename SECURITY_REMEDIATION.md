# Agora — Security Remediation Log

> Source audit: `AGORA_SECURITY_AUDIT.md`  
> Sprints: June 24–25, 2026  
> Stack: Next.js 14.2.35, next-auth v5.0.0-beta.30, Prisma 5.22, PostgreSQL, Docker Compose, Cloudflare Tunnel

---

## Status Summary

| Stage | Items | Status |
|-------|-------|--------|
| Stage 0 — Emergency | 4 | ✅ Complete |
| Stage 1 — Near-term | 7 | ✅ Complete (Next.js upgrade deferred) |
| Stage 2 — Structural | 6 | ⏳ Partially complete — see below |

---

## Sprint 1 — June 24, 2026 (PRs #1–#13)

### ✅ P0-1 · Global authentication gate (PR #1)
**Was:** Public by default — individual routes had to opt into auth checks. Several routes forgot.  
**Fix:** Middleware flipped to private-by-default with an explicit public allowlist (`/login`, `/setup`, `/api/auth/*`, `/api/approvals/*`, `/forms/*`, static assets). Every other path verifies the session JWT at the edge. No session → 401 (API) or redirect to `/login` (pages).

### ✅ P0-2 · Revocable sessions (PR #1)
**Was:** Pure JWT strategy — stolen cookies valid for 8 hours with no server-side kill switch. Logout only cleared the client cookie.  
**Fix:** New `UserSession` table. Every login creates a server-side session record (`sid` stored in JWT). Every `auth()` call validates the record — revoked/expired/disabled sessions rejected immediately. `POST /api/auth/logout` revokes the current session. `POST /api/auth/revoke-all` kills all sessions ("log out everywhere"). Cookie hardened to `__Host-` prefix in production.

### ✅ P0-2b · Approval workflow identity forgery (PR #1)
**Was:** `action/route.ts` took `userId` from the request body — anyone with a valid token could approve/deny as any user. Duplicate `approvalAction.create` wrote two audit records per action.  
**Fix:** Identity derived from `session.user.id` only. Body `userId` ignored. Duplicate create removed.

### ✅ P0-2b · Approval token strength (PR #9)
**Was:** `ApprovalRequest.token` used `@default(cuid())` — timestamp-based, ~100 bits of entropy, enumerable under load.  
**Fix:** `crypto.randomBytes(32).toString('hex')` — 256 bits, cryptographically random, generated at creation in all three create sites.

### ✅ P0-3 · IDOR on table routes (PR #7)
**Was:** 15 route handlers under `app/api/tables/[id]/` were session-gated but missing `getTablePermission()` checks. Any authenticated user could read/write another user's table data by changing `[id]` in the URL.  
**Fix:** `getTablePermission(session.user.id, params.id)` added to every bare handler. `[rowId]` routes also verify `row.tableId === params.id` before returning data.

### ✅ P0-4 · WebSocket table-room authorization (PR #8)
**Was:** WS server authenticated connections (JWT, origin, rate-limit) but accepted any `userId → tableId` registration without a permission check. Authenticated users could subscribe to any table's live broadcasts.  
**Fix:** `register` message handler calls internal endpoint `GET /api/ws/check-table-access` (protected by `BROADCAST_SECRET`) before adding a client to a room. Denied → silently dropped.

### ✅ P1-1 · Cron secret separation (PR #3)
**Was:** `cron/reminders` compared `x-cron-secret` against `NEXTAUTH_SECRET` — the same key that signs session JWTs. `automations/cron` skipped auth entirely when `CRON_SECRET` env var was absent.  
**Fix:** Dedicated `CRON_SECRET` env var required on both routes. `timingSafeEqual` used for comparison. Secret passed as `X-Cron-Secret` header (not query string — secrets in URLs land in logs).

### ✅ P1-3 · App port bound to loopback (PR #10)
**Was:** `"3000:3000"` — app reachable on host public interfaces, bypassing Cloudflare Tunnel.  
**Fix:** `"127.0.0.1:3000:3000"`.

### ✅ P2 · Content-Disposition header injection (PR #10)
**Was:** `attachment.originalName` interpolated directly into the `Content-Disposition` header.  
**Fix:** Control chars, quotes, and backslashes stripped before interpolation.

### ✅ P2 · SMTP SSL/port misconfiguration (PR #2)
**Was:** `secure` flag stored separately from port — `secure: true` + port 587 produced an OpenSSL `wrong version number` error. App passwords with spaces caused auth failures.  
**Fix:** `secure` is now derived from port number (`port === 465`). UI links port and SSL checkbox. App password field strips whitespace on input and before encrypting.

### ✅ P2 · CSV formula injection (PR #16)
**Was:** CSV export did not sanitise cells starting with `=`, `+`, `-`, `@` — spreadsheet formula/DDE injection when admins open exports.  
**Fix:** Dangerous lead characters prefixed with TAB inside the quoted field.

### ✅ Misc · Table permission helper (PR #5)
**Was:** Per-handler permission check copy-pasted and drifting (`rows GET` used `!permission`; writes used `!permission || permission === 'viewer'`).  
**Fix:** `requireTablePermission(userId, tableId, 'read'|'write'|'admin')` helper in `lib/tablePermissions.ts`. Returns 403 `NextResponse` on denial, `null` on success.

### ✅ Misc · Encryption key hardening (PR #4)
**Was:** Missing `ENCRYPTION_KEY` silently fell back to `NEXTAUTH_SECRET` with a console warn.  
**Fix:** Throws in production — app refuses to handle requests until key is properly set.

### ✅ Misc · Prisma migration infrastructure (PR #11–#12)
**Was:** `npx prisma migrate deploy` in entrypoint picked up globally-installed Prisma 7.x (wrong version). `.bin/prisma` is a symlink that doesn't copy cleanly in multi-stage Docker builds.  
**Fix:** Entrypoint uses `node node_modules/prisma/build/index.js migrate deploy`. Dockerfile copies `node_modules/prisma` from builder stage.

### ✅ Misc · Pre-release cleanup (PR #13)
Removed `scripts/test-google-sheets.ts` (contained hardcoded personal Google Sheet ID). Added `migrate.sql` to `.gitignore`.

---

## Sprint 2 — June 25, 2026 (PRs #14–#23)

### ✅ CRITICAL · MFA bypass on API routes (PR #14)
**Was:** `middleware.ts` had `!pathname.startsWith('/api/')` in the MFA guard — MFA was a UI gate only. A phished password gave full API data access with no second factor.  
**Fix:** MFA enforcement now applies to all routes. API routes with unverified MFA get `401 { code: 'MFA_REQUIRED' }`. Only `/verify-mfa`, `/api/auth/mfa`, and `/api/auth/nextauth` are exempt.  
**ASVS:** V2.2.1, V4.1.1, V4.1.3

### ✅ CRITICAL · OTP hardening — attempt cap + hashed storage (PR #15)
**Was:** 6-digit OTP had no attempt limit (10^6 space brute-forceable in minutes), stored in plaintext (DB dump exposes live codes), 10-minute TTL.  
**Fix:** Codes stored as `SHA-256(otp)`. Max 5 wrong attempts — code invalidated on cap. TTL reduced to 5 minutes. Entire `/api/auth/mfa` rate-limited at auth tier (5 req/min per IP).  
**ASVS:** V2.2.1, V2.5.x, V2.8.x

### ✅ HIGH · User enumeration via timing oracle (PR #15)
**Was:** argon2 only ran for existing users — non-existent users returned immediately, revealing whether an email is registered via response time.  
**Fix:** Dummy argon2 verify runs for non-existent users to equalise timing.  
**ASVS:** V2.2.1, V7.4.1

### ✅ HIGH · X-Forwarded-For spoofing in rate limiters (PR #17)
**Was:** `rateLimiter.ts` and `middleware.ts` checked `X-Forwarded-For` first — fully attacker-controlled, allows IP spoofing to bypass rate limits and poison audit logs.  
**Fix:** `CF-Connecting-IP` (set by Cloudflare, unforgeable by clients) checked first. XFF kept as last-resort fallback for non-Cloudflare dev environments.  
**ASVS:** V11.x, V7.x

### ✅ HIGH · xlsx CVEs — prototype pollution + ReDoS (PR #18)
**Was:** `xlsx 0.18.5` — abandoned npm package with CVE-2023-30533 (prototype pollution on file read, CVSS 7.8) and CVE-2024-22363 (ReDoS). User-uploaded spreadsheets are the attack path.  
**Fix:** Replaced with `@e965/xlsx ^0.20.3` — maintained community fork with both CVEs patched. Drop-in replacement, identical API.  
**ASVS:** V14.2.x

### ✅ HIGH · Unauthenticated inbound webhooks (PR #19)
**Was:** `/api/automations/webhook/[slug]` had no authentication — anyone who discovered or guessed a slug could trigger automations (create rows, send emails, kick off approvals).  
**Fix:** New `webhookSecret` field on `Automation` (auto-generated on creation). When set, requests must include `X-Agora-Signature: sha256=<HMAC-SHA256(secret, body)>`. Validated with `timingSafeEqual`. Also accepts `X-Hub-Signature-256` (GitHub-compatible). Automations without a secret remain open for backwards compatibility.  
**ASVS:** V13.x

### ✅ HIGH · Container hardening (PR #20)
**Was:** No Linux capability restrictions on the web container. PostgreSQL using default `md5` auth.  
**Fix:**
- `web`: `cap_drop: ALL` + `cap_add: NET_BIND_SERVICE`, `security_opt: no-new-privileges:true`
- `postgres`: `security_opt: no-new-privileges:true`, `POSTGRES_HOST_AUTH_METHOD: scram-sha-256`  
**ASVS:** V14.1.x, V1.2.x, V8.x

### ✅ MEDIUM · Production browser source maps exposed (PR #21)
**Was:** `productionBrowserSourceMaps` not set — Next.js default behaviour ships source maps to browsers, exposing full TypeScript source via DevTools.  
**Fix:** `productionBrowserSourceMaps: false` explicitly set in `next.config.js`.  
**ASVS:** V14.3.2

### ✅ MEDIUM · Account lockout DoS (PR #22)
**Was:** Hard 30-minute lockout after 5 failed logins — an attacker who knows a user's email can lock them out indefinitely by sending one wrong request every 30 minutes.  
**Fix:** Exponential backoff: attempt 5 → 2 min, 6 → 4 min, 7 → 8 min, 8+ → 30 min cap. Targeted DoS has much shorter blast radius; brute-force still faces escalating delays.  
**ASVS:** V2.2.1

### ✅ MEDIUM · SSRF redirect bypass (PR #23)
**Was:** `safeFetch` validated the initial URL's IP, then set `redirect: 'manual'` but returned the redirect response — callers could follow it to a private IP. DNS rebinding could flip the IP between validation and fetch.  
**Fix:** Manually follows up to 5 redirects. Each hop re-resolves the `Location` hostname via DNS and re-runs `isPrivateIP()`. Blocks redirects to private IPs, non-HTTP protocols, and embedded credentials.  
**ASVS:** V5.2.6, V12.6.1

---

## Confirmed Safe — No Action Taken

| Finding | Reason |
|---------|--------|
| Formula evaluator RCE | AST-walking interpreter (`lib/formula/evaluator.ts`). No `eval` or `new Function`. |
| CVE-2026-44578 (WebSocket SSRF) | nginx DMZ has no WS upgrade proxying. App port bound to `127.0.0.1`. Pre-auth path blocked at infrastructure layer. |
| SQL injection via Prisma | No `$queryRawUnsafe` calls found. All queries use Prisma's parameterized API. |
| `dangerouslySetInnerHTML` XSS | Full codebase scan returned no instances. |
| Approval token replay | `crypto.randomBytes(32)` tokens, single-use (marked used after action), expiring. |
| Auth.js GHSA-5jpx-9hw9-2fx4 | Fixed precisely at v5.0.0-beta.30 — the pinned version. Monitor for drift. |

---

## Remaining / Deferred

### Stage 1 — Near-term

| Item | Priority | Notes |
|------|----------|-------|
| **Next.js upgrade to 15.5.18+** | HIGH | Only durable fix for the May 2026 advisory cluster (RSC DoS, CSP-nonce XSS, middleware bypass). Major version migration — needs dedicated sprint. |
| **In-memory rate limiter persistence** | MEDIUM | `LoginRateLimiter` resets on container restart. Fix requires Redis or Postgres-backed counter for multi-instance / restart-durable rate limiting. |

### Stage 2 — Structural

| Item | Priority | Notes |
|------|----------|-------|
| **SPF / DKIM / DMARC** | MEDIUM | Approval and MFA emails are security-relevant. Configure `p=reject` on `boudreaulogic.com` to prevent email spoofing. DNS config, not code. |
| **Git history secret scan** | MEDIUM | Run `gitleaks` or `trufflehog` against full commit history. Rotate anything ever committed. |
| **Audit hash chain anchoring** | LOW-MEDIUM | Current chain is tamper-evident, not tamper-proof — an attacker with DB write access can recompute it. Anchor chain heads externally or use append-only DB permissions. |
| **Better Auth / session timeout** | LOW | Auth.js v5 is perpetual beta; maintainers recommend Better Auth. 8-hour JWT is long for sovereign data clients. Structural migration. |
| **Google service account scopes** | LOW | Minimize to read-only where possible; store key as a file secret outside the image. |

---

## Migrations Required

After merging PRs, run on the server before rebuilding:

```bash
# Apply all pending schema migrations
docker compose exec web node node_modules/prisma/build/index.js migrate deploy
```

### Pending migrations (from Sprint 2 PRs)

| Migration | PR | Description |
|-----------|----|-------------|
| `20260625000001_mfa_code_hardening` | #15 | Adds `attempts` column to `mfa_codes` |
| `20260625000002_automation_webhook_secret` | #19 | Adds `webhooksecret` column to `automations` |

### Already applied (Sprint 1)

| Migration | Description |
|-----------|-------------|
| `20260624000001_add_user_sessions` | Creates `user_sessions` table for revocable sessions |
| `20260624000002_approval_token_no_default` | Removes cuid default from `approval_requests.token` |

---

## Environment Variables Added

These must be set before rebuilding:

| Variable | Purpose | How to generate |
|----------|---------|-----------------|
| `CRON_SECRET` | Authenticates cron scheduler calls | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Field-level encryption (was optional, now required in prod) | `openssl rand -hex 32` |

---

*Last updated: June 25, 2026*
