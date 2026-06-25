# Agora — Security Audit v2 (Master Worklist)

> **Supersedes v1.** This is the single source of truth for the security effort. Read the whole file.
> **Date:** 2026-06-25 · **Audience:** the implementing agent (Claude Code in the `agora` Docker Sandbox, repo `C:\Users\hunter\Documents\agora`).
> **Stack:** Next.js 14.2.35 (App Router), next-auth v5.0.0-beta.30, Prisma 5.22 / PostgreSQL, Docker Compose, Cloudflare Tunnel, custom WS server on :3001.
> **Why v2 exists:** v1 was pasted into the agent chat but got truncated mid-file, so only the top half was acted on. This file is complete and reflects work already done in session 1 (PRs #14–16). Start from §3 (Remaining Work).

---

## 1. How to work this document

1. **Verify before you change.** Every code-level claim is a hypothesis to confirm against source first. If already fixed/safe, note it and move on — don't "fix" working code.
2. **Work order:** §3A items first (these include verifying what was just shipped), then §3B structural items. One logical PR per item or tight group.
3. **Per item, produce:** confirming evidence (file + grep/line), the fix, one-line note of what changed.
4. **Preserve conventions:** `export const` (not `var`) for Next route segment config; SWC `function` + `var` in client components; `<a>` (not `<Link>`) for sidebar nav; `import { auth } from '@/lib/auth'`; `import { db } from '@/lib/db'`. After any build, grep compiled output in **both** `.next/static/` and `.next/server/`. No BOM / smart-quote corruption in TSX.
5. **Don't regress the June 24 sprint or the session-1 fixes** in §2.

---

## 2. Done & Confirmed-Good (do not redo)

### Fixed in session 1
| PR | Finding | Fix |
|----|---------|-----|
| **#14** | MFA bypass on API routes (CRITICAL) | Removed `!pathname.startsWith('/api/')` from the MFA guard. Unverified-MFA API calls → `401 {code:'MFA_REQUIRED'}`; pages → redirect `/verify-mfa`. Exempt: `/verify-mfa`, `/api/auth/mfa`, `/api/auth/nextauth`. |
| **#15** | OTP brute-force + plaintext + enum timing (CRITICAL) | `attempts` column on `mfa_codes` (capped at 5, query filters `attempts < 5` so capped == expired); `/api/auth/mfa` rate-limited 5/min/IP; TTL 10→5 min; codes stored as `SHA-256(otp)`; dummy argon2 verify for non-existent users to kill the timing oracle. Migration `20260625000001_mfa_code_hardening`. |
| **#16** | CSV formula injection (HIGH) | Cells starting with `= + - @ TAB CR` get a TAB prefix inside a forced double-quoted field so spreadsheet apps treat them as text. `app/tables/[id]/ExportMenu.tsx`. |

> **Post-merge action:** `prisma migrate deploy` (or `ALTER TABLE "mfa_codes" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;`).

### Verified safe — do not touch
- **Formula evaluator** — AST-walking interpreter (`lib/formula/evaluator.ts`); no `eval`/`new Function` anywhere. Not an RCE surface. *(Residual SSRF-TOCTOU note lives in §3A-N, not here.)*
- **`safeFetch` / `lib/ssrfProtection.ts`** — blocks RFC1918 / 127.x / 169.254.x / ::1 / fc00::/7, embedded creds, non-HTTP(S), and disables redirect following; all connectors route through it. *(The one remaining gap — DNS-rebinding TOCTOU — is §3A-N.)*
- **No raw SQL** — no `$queryRawUnsafe` / unsafe `$queryRaw` interpolation.
- **No `dangerouslySetInnerHTML`** — grep clean.
- **CVE-2026-44578 (WebSocket SSRF) network path** — nginx DMZ has no `proxy_set_header Upgrade` in any allowed block, and the app binds `127.0.0.1:3000`. The pre-auth Next.js WS-upgrade path is blocked at the network layer. **Caveat:** this is the *framework CVE*, not the custom WS server — see §3A-B.
- **June 24 sprint (13 PRs) intact** — private-by-default middleware, revocable `UserSession`, IDOR fixes on 15+ table routes, session-derived approval identity, `crypto.randomBytes` tokens, `CRON_SECRET` separation, encryption-throws-in-prod.
- **`app/api/setup/route.ts`** guards first-admin at the API level; **table routes** follow `auth()` → `canViewTable()` → ownership; **`__Host-` cookies** and the **CVE-2025-29927 header strip** present.

---

## 3. Remaining Work

### 3A — Verify / skipped (do these next)

These were **not** covered in session 1 (several because the file was truncated). A couple are checks on code that was just shipped.

**A. Trusted client IP / X-Forwarded-For spoofing — HIGH (check what was just shipped).**
The new `/api/auth/mfa` throttle, the login limiter, account lockout, and audit logs are only as trustworthy as the IP they key on. Behind Cloudflare Tunnel the real client IP is `CF-Connecting-IP`; raw `X-Forwarded-For` is attacker-prependable. If any of these read `xff.split(',')[0]`, the IP-keyed throttles are bypassable per-request and audit IPs are forgeable. *(The per-code `attempts < 5` cap is keyed to the code, not the IP, so OTP brute-force stays blocked — this is about the endpoint throttle, login limiter, lockout, and log integrity.)* Fix: a single trusted-IP helper that reads `CF-Connecting-IP` (fall back to last XFF hop only), used everywhere an IP is keyed or logged. **ASVS V11.x, V7.x.**

**B. Custom WebSocket server (:3001) auth model — MEDIUM-HIGH (skipped; CVE answer ≠ server audit).**
Session 1 answered the framework CVE, not the server itself. Audit: (1) is every connection authenticated at the upgrade handshake (short-lived token, not a long-lived session in a query string that lands in logs)? (2) is `Origin` validated against an allowlist (CSWSH — and Origin is advisory, so pair with token auth)? (3) are broadcasts scoped per user/tenant, or can one connection receive another's data? (4) is `BROADCAST_SECRET` server-side only and rotatable? (5) WSS/TLS? This goes **live and unaudited** the moment the "WSS behind Cloudflare Tunnel" roadmap item lands. Also check the **cloudflared ingress** for app.boudreaulogic.com, not just the nginx DMZ. **ASVS V13.x, V3.x, V9.x.**

**C. Session revocation actually enforced on API routes — HIGH (existence ≠ enforcement).**
The `UserSession` table exists, but confirm the revocation check fires on plain `/api/*` data routes. Test: revoke a session, then hit an `/api/` data endpoint with that token → expect 401. If it doesn't fire, a stolen/revoked JWT still works until expiry. **ASVS V3.2.x, V3.3.x.**

**D. Audit hash-chain integrity — HIGH (skipped; this is the headline feature).**
"Tamper-evident" only holds if the evidence can't be regenerated. Confirm: can an actor with DB write recompute the entire chain undetected? Are chain heads anchored to an external/append-only store, or signed with a key the app server doesn't hold? Are audit writes append-only at the DB-permission level? Does coverage include auth events, authz failures, exports, and admin actions? **ASVS V7.1.x–V7.3.x.**

**E. PostgreSQL hardening — MEDIUM-HIGH (skipped).**
Confirm `scram-sha-256` (not `trust`/`md5`), no `listen_addresses='*'` + `0.0.0.0/0`, a strong non-default password, a least-privilege app role (never superuser), TLS in transit, and per-account connection limits. **ASVS V1.2.x, V8.x, V10.x.**

**F. `lib/encryption.ts` scope & cipher — MEDIUM (skipped).**
The sprint made it *throw* on a missing key, but confirm *what* is encrypted (field-level PII vs nothing meaningful), that it's AES-256-GCM (authenticated) with a unique per-record nonce, and that the master `ENCRYPTION_KEY` lives outside the image and is rotatable. **ASVS V6.2.x, V8.3.x.**

**G. Mass assignment on `AgoraRow.data` writes — MEDIUM (skipped).**
`data` is JSON keyed by column ID — a mass-assignment magnet. Confirm writes are allowlisted against the table schema so a user can't set columns/fields they shouldn't (including any permission-bearing field). **ASVS V4.2.2, V4.1.x.**

**H. Approval-link lifecycle — MEDIUM (skipped; core to the approval workflow).**
Tokens have good entropy (`crypto.randomBytes(32)`). Confirm they are single-use, expiring, rate-limited, invalidated after use, and that the approval state change is CSRF-protected and **re-authorized server-side** ("valid token" ≠ "approved"). **ASVS V2.5.x, V4.2.2.**

**I. Git-history secret scan — MEDIUM (skipped).**
Run gitleaks/trufflehog over full history; rotate anything ever committed. Security must not depend on repo privacy. **ASVS V1.14.x, V6.4.x.**

### 3B — Deferred structural (Stage 1, agent correctly deferred these)

| # | Finding | Risk | Fix |
|---|---------|------|-----|
| **J** | Next.js 14.2.35 EOL | HIGH | No 14.x backports for the May 2026 cluster (RSC DoS, cache poisoning, CSP-nonce XSS). Migrate to 15.5.18+ / 16.2.6+. Major-version migration. **ASVS V14.2.1.** |
| **K** | xlsx 0.18.5 (abandoned) | HIGH | CVE-2023-30533 (prototype pollution on read) + CVE-2024-22363 (ReDoS). Replace with `@e965/xlsx` or SheetJS 0.20.2+ CDN build; retest import. **ASVS V14.2.x.** |
| **L** | In-memory rate limiters | HIGH | `LoginRateLimiter` + the IP limiter reset on restart and don't share across instances. Move to Redis/Postgres. *(Same subsystem as 3A-A — do together.)* **ASVS V11.x.** |
| **M** | Account-lockout DoS | HIGH | Email-keyed 5→30min lets anyone lock out a known user. Exponential backoff + CAPTCHA instead of hard lockout. **ASVS V2.2.1.** |
| **N** | `safeFetch` TOCTOU | MEDIUM | Validate-then-fetch is DNS-rebinding-bypassable. Pin the validated IP to the socket via a custom Node agent. Current guard still blocks the obvious path. **ASVS V5.2.6, V12.6.1.** |
| **O** | Container hardening | MEDIUM | Prod container runs as root before dropping to `nextjs`. Add `cap_drop: ALL`, `no-new-privileges: true`, read-only rootfs + explicit writable mounts; file-based secrets. **ASVS V14.1.x.** |
| **P** | SPF / DKIM / DMARC | MEDIUM | No `p=reject` on `boudreaulogic.com` → approval/MFA emails are spoofable. DNS config, not code. **ASVS V1.x.** |
| **Q** | Session absolute timeout | LOW-MED | 8-hour JWT is long for sovereign data. Shorten + add idle timeout. **ASVS V3.3.x.** |

---

## 4. Notes & thresholds
- ASVS IDs use the familiar V4.0.x numbering; remap to ASVS 5.0.0 (`v5.0.0-<chapter>.<section>.<req>`) in any client-facing version.
- **Thresholds that escalate priority:** regulated student/health PII → push V2/V3/V6 to ASVS L3. If the WS server carries cross-user data → 3A-B is CRITICAL until per-message authz is proven. If the origin ever answers direct (non-tunneled) requests → all Cloudflare-tier protections are void until the origin firewall is locked to Cloudflare ranges.
- next-auth GHSA-5jpx-9hw9-2fx4 (email misdelivery) is fixed precisely at beta.30, the pinned version — correct today but fragile; guard the pin and watch the `@auth/core` chain.
