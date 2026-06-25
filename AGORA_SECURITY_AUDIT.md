# Agora — Security Audit & Remediation Worklist

> **Audience:** the implementing agent (Claude Code, running in the `agora` Docker Sandbox on `C:\Users\hunter\Documents\agora`).
> **Date:** June 2026 · **Stack:** Next.js 14.2.35 (App Router), next-auth v5.0.0-beta.30, Prisma 5.22 / PostgreSQL, Docker Compose, Cloudflare Tunnel, custom WS server on :3001.

---

## 0. How to work this document (READ FIRST)

This is an **adversarial breach-risk audit** plus live CVE research. It was assembled to find *everything* that could realistically lead to a data breach or account compromise, across three threat models: (1) unauthenticated internet attackers/bots, (2) a malicious authenticated user escalating inside an instance, (3) a targeted attacker after one client's sovereign data. Findings are mapped to **OWASP ASVS L2** so this file can double as a client-facing artifact.

**Rules of engagement for the agent:**

1. **Verify before you change.** Treat every code-level claim as a *hypothesis to confirm against actual source first*. Locate the code, confirm the issue is real and not already fixed, then remediate. If a finding is already mitigated, note it and move on — do not "fix" working code.
2. **Do not regress the June 24 security sprint.** 13 PRs already landed (caller-derived identity on approval routes, private-by-default middleware, revocable `UserSession` sessions with `sid`, IDOR fixes across ~15 table routes, crypto.randomBytes approval tokens, `CRON_SECRET` separation, encryption-throws-in-prod, port-derived SMTP secure flag). Several findings below overlap with that work — **check whether they're already resolved before acting.**
3. **Work in priority order.** Stage 0 (emergency) first, top to bottom. Don't batch-fix blindly across stages.
4. **Per finding, produce:** the confirming evidence (file + line / grep), the fix, and a one-line note of what changed. Group related fixes into logical PRs per the existing GitHub workflow.
5. **Preserve repo conventions:** `export const` (not `var`) for Next route segment config (`dynamic`/`revalidate`/`runtime`); general SWC `function` + `var` in client components; `<a>` tags (not `<Link>`) for sidebar nav; auth via `import { auth } from '@/lib/auth'`; db via `import { db } from '@/lib/db'`. After any build, verify compiled output with grep against **both** `.next/static/` and `.next/server/`. Do not corrupt TSX (no BOM / smart-quote substitution).

---

## 0a. Confirmation status (don't re-verify the confirmed items)

The deep-research pass ran **without** repo access and caveats everything accordingly. However, several items **were already confirmed against actual source earlier in this engagement**. Status below overrides the blanket "unverified" caveat in §Caveats.

**CONFIRMED against source — treat as real:**
- **MFA-API gap is real.** `middleware.ts` gates MFA with `!pathname.startsWith('/api/')`, so a password-only session reaches every `/api/*` data route. (Finding 1.)
- **In-memory rate limiters** (login-by-email in `lib/auth/password.ts`; login-by-IP in `middleware.ts`) — confirmed; reset on restart, per-instance only. (Finding 4.)
- **Account-lockout keyed on email** (5 fails → 30 min in `authorize()`). (Finding 3.)
- **User enumeration** — distinct error strings + argon2-only-for-existing-users timing. (Finding 12.)
- **Versions:** `next` resolves to **14.2.35**, `next-auth` to **5.0.0-beta.30**, `xlsx` **0.18.5** (all from lockfile). `npm audit` = **24 findings, 14 high** (most are dev/build tooling). (Findings 2, 6, plus dependency notes.)

**NOT a finding (confirmed good — do not "fix"):**
- `app/api/setup/route.ts` correctly guards first-admin creation at the API level (`existingUser` check + P2002 race handling), not just the page.
- Table routes follow `auth()` → `canViewTable(session.user.id, ...)` → ownership check. The per-route authz pattern is sound.
- `__Host-` cookie prefix in prod, CVE-2025-29927 `x-middleware-subrequest` header strip, CSP/HSTS, oversized-body block — all present and correct.

**NOT YET VERIFIED — agent must check against source before acting:**
- Formula evaluator implementation (`eval`/`Function` vs sandboxed AST) — Finding 8.
- `lib/ssrfProtection.ts` TOCTOU / DNS-pinning behavior and whether all connectors route through it — Finding 9.
- WebSocket :3001 connection auth, Origin validation, WSS, `BROADCAST_SECRET` scoping — Finding 10.
- OTP: plaintext storage + missing attempt cap in the MFA verify route — Finding 1.
- `lib/encryption.ts` cipher (AES-256-GCM? per-record nonce?) and *what* is encrypted — §8.
- Audit hash-chain anchoring / append-only enforcement — §8.
- Docker non-root/caps, Postgres auth method + exposure, Cloudflare origin-lockdown, SPF/DKIM/DMARC, git-history secrets — §5–7.

---

## Key Findings (ranked by likelihood × blast radius)

1. **CRITICAL — MFA bypass on API routes + unthrottled OTP.** Middleware excludes `/api/` from MFA. A credential-stuffed or phished password yields full API data access without the second factor. OTP verify has no attempt cap (10^6 space → brute-forceable), and plaintext OTP storage means a DB/backup read exposes live codes.
2. **CRITICAL — EOL Next.js 14.2.35.** No security backports as of the May 2026 wave. WebSocket-upgrade SSRF **CVE-2026-44578** (GHSA-c4j6-fc7j-m34r, CVSS 8.6, CWE-918) is **pre-auth**, affects self-hosted Node servers (`next >= 13.4.13 < 15.5.16`), and has **no 14.x patch**.
3. **HIGH — Account-lockout DoS.** Email-keyed lockout (5 → 30 min) lets an attacker lock out publicly-identifiable tribal-government users at will.
4. **HIGH — In-memory rate limiters.** Reset on container restart, not shared across instances; defeats brute-force protection and enables reset-to-bypass.
5. **HIGH — JWT session revocation gap.** A stolen/replayed JWT stays valid until expiry unless the `UserSession` validation runs on **every** access path, including API routes (which currently bypass middleware MFA).
6. **HIGH — xlsx 0.18.5 (abandoned).** Prototype pollution (CVE-2023-30533) on file *read*; ReDoS (CVE-2024-22363). The import feature that parses user spreadsheets is the exposed path.
7. **HIGH — CSV/formula injection in exports.** Admins opening exports in Excel can be hit with `=`/`+`/`-`/`@` formula injection / DDE / data exfiltration.
8. **HIGH — Custom formula evaluator.** If eval-based → server-side RCE. Even a custom parser is a ReDoS/DoS and logic-bypass surface.
9. **HIGH — SSRF via connectors + `ssrfProtection` TOCTOU.** Google Sheets/Drive, external SQL, webhooks. Validate-then-refetch is bypassable via DNS rebinding to 169.254.169.254 / internal services.
10. **MEDIUM-HIGH — WebSocket :3001 auth model.** Origin validation, WSS/TLS, per-connection + per-message auth, and `BROADCAST_SECRET` scoping decide whether real-time data leaks across sessions/tenants.
11. **MEDIUM-HIGH — Docker/Postgres/secrets hygiene.** Root containers, secrets in env/`docker inspect`, Postgres auth/exposure, git-pull deploy model, secrets in git history.
12. **MEDIUM — User enumeration + email spoofing.** Distinct errors + argon2 timing oracle; missing/weak SPF/DKIM/DMARC enabling forged approval emails.
13. **MEDIUM — Audit-chain integrity + X-Forwarded-For trust.** Forgeable XFF poisons rate limiting and audit logs; hash-chain integrity depends on external anchoring.

---

## Details by Category

### 1. Authentication & Session Security

**MFA enforcement gap (CRITICAL).** `!pathname.startsWith('/api/')` makes MFA a UI gate, not a security boundary. Next.js's own May 2026 guidance — enforce authorization at the route/page level rather than relying on middleware alone — damns the API exclusion: data handlers must independently verify MFA state from the session. **ASVS L2: V2.2.1, V4.1.1/V4.1.3, V1.4.4.**

**OTP brute-force (CRITICAL).** No attempt cap on a 6-digit code is CWE-307. The 10^6 keyspace falls in hours without throttling. Plaintext storage is strictly worse than hashed — any DB/backup read yields live codes. Make codes single-use, ≤5 min TTL, attempt-capped (5), and hashed. **ASVS L2: V2.2.1, V2.5.x, V2.8.x.**

**JWT vs database sessions — revocation footgun.** Auth.js is explicit: a JWT cannot be expired before its encoded expiry without a server-side blocklist, and a JWT saved elsewhere stays valid until expiry even after the cookie is destroyed. The `UserSession` table checked on the session callback is the correct mitigation — but only if *every* data path triggers it. Because API routes bypass middleware MFA, confirm they also run the revocation check, or a revoked/stolen token still works against APIs. 8-hour absolute session is long for sovereign data. **ASVS L2: V3.2.x, V3.3.x, V3.5.x.**

**Auth.js v5 beta posture.** v5.0.0-beta.30 is a perpetual beta; maintainers now recommend Better Auth for new projects. Directly relevant: **GHSA-5jpx-9hw9-2fx4** (Oct 27 2025, CVSS 6.9) — a crafted address like `"e@attacker.com"@victim.com` causes login/verification links to be delivered to the attacker. It affects `>= 5.0.0-beta.0, < 5.0.0-beta.30` — **beta.30 is exactly the first fixed release.** Correct today, but fragile: guard the pin, watch the `@auth/core` chain. Confirm `AUTH_SECRET` is high-entropy and uncommitted. **ASVS L2: V2.10.x, V3.4.x, V6.2.x.**

**Account-lockout DoS + in-memory limiters.** Email-keyed lockout is a targeted availability attack on named users. In-memory limiters reset on restart and don't share across the fleet. Use a shared store (Redis) with IP+account dimensions, exponential backoff instead of hard lockout, and CAPTCHA escalation. **ASVS L2: V2.2.1, V11.x.**

**User enumeration.** Distinct errors + argon2-only-for-existing-users timing oracle. Return uniform errors and run a dummy argon2 verify for non-existent users to equalize timing. **ASVS L2: V2.2.1, V7.4.1.**

### 2. Authorization / IDOR / Multi-Tenancy

Per-instance DB/container/domain isolation is strong against cross-tenant leakage. Residual risk is **within-instance**:
- **BOLA/IDOR (API1:2023):** routes fetching a resource by ID must verify ownership/role, not just authentication. With MFA-less API access, a low-priv user enumerating IDs is the most realistic data-theft path. (Note: table routes already do this — confirm the pattern holds on *all* object types, not just tables.)
- **Function-level authz (API5:2023):** admin/provisioning endpoints must enforce role server-side.
- **Mass assignment:** `AgoraRow.data` as JSON keyed by column ID is a mass-assignment magnet — allowlist writes against the schema so users can't set permission-bearing fields.
- **Vertical escalation:** ensure roles cannot be self-applied; confirm no dev-only "change role" endpoint shipped to prod.

**ASVS L2: V4.1.1, V4.1.3, V4.2.1, V4.2.2, V1.4.x.**

### 3. Injection & Input Handling

- **SQL injection / Prisma:** Prisma parameterizes by default, but `$queryRawUnsafe` with string-building re-introduces injection; even `$queryRaw` can be subverted by a fake tagged-template object (array with a `.raw` property). Audit every raw call; use `Prisma.sql`/placeholders; never interpolate identifiers from user input. **ASVS L2: V5.3.4, V5.3.5.**
- **JSON injection:** validate `AgoraRow.data` keys/values with zod before building filters.
- **XSS:** EOL 14.x won't get the May 2026 CSP-nonce XSS fix (GHSA-ffhc-5mcf-pf4q) or beforeInteractive fix (GHSA-gx5p-jg67-6x7h). Enforce output encoding + nonce-based CSP; never `dangerouslySetInnerHTML` with user content. **ASVS L2: V5.3.3, V5.3.1.**
- **Formula evaluator (HIGH):** if `eval`/`Function`-based → server-side RCE. Require a sandboxed AST interpreter with no host-object access and recursion/time/ReDoS bounds. **ASVS L2: V5.2.4, V5.2.8.**
- **CSV/formula injection (HIGH):** prefix any cell starting with `=`,`+`,`-`,`@` (plus tab/CR and full-width ＝＋－＠) with a leading tab/quote *inside the quoted field*; handle separator/quote injection. Critical because admins open exports in Excel/LibreOffice where DDE can reach command execution. **ASVS L2: V5.3.x.**
- **SSRF via connectors (HIGH):** `ssrfProtection` must (a) allowlist destinations, (b) block RFC1918 / 127/8 / 169.254/16 / ::1 / fc00::/7 / fe80::/10 at the resolution layer, (c) **DNS-pin** the validated IP to the socket to defeat TOCTOU/rebinding (cf. Budibase GHSA-gfq7-5x4g-3xhf, Craft GHSA-gp2f-7wcm-5fhx), (d) disable or re-validate redirects, (e) https-only. Pair with egress firewalling; if cloud-hosted, IMDSv2 hop-limit 1. **ASVS L2: V5.2.6, V12.6.1.**
- **XXE (Populi legacy XML):** disable external-entity/DTD processing. **ASVS L2: V5.5.2.**
- **xlsx prototype pollution / ReDoS:** CVE-2023-30533 (≤0.19.2, fixed 0.19.3) on *read*; CVE-2024-22363 (≤0.20.1, fixed 0.20.2, CWE-1333). npm `xlsx` is unmaintained — install 0.20.2+ from `https://cdn.sheetjs.com/` or migrate to `@e965/xlsx`. **ASVS L2: V14.2.x.**

### 4. Next.js Framework-Specific

EOL 14.2.35 dominates. Relevant May 6–7 2026 advisories (patched only in 15.5.18 / 16.2.6, **not** backported to 13.x/14.x):
- **CVE-2026-44578 / GHSA-c4j6-fc7j-m34r — WebSocket-upgrade SSRF (CVSS 8.6, CWE-918).** `next >= 13.4.13 < 15.5.16`; self-hosted Node server affected; **pre-auth**; can proxy to internal services / cloud metadata; Vercel-hosted not affected; Cloudflare confirmed no safe managed WAF rule. **No 14.x patch** → upgrade or block WS upgrades + restrict origin egress.
- **Middleware/proxy bypass cluster** (GHSA-267c-6grr-h53f + follow-ups, GHSA-36qx-fr4f-26g5): `.rsc`/segment-prefetch and i18n `/_next/data/...json` URLs resolve past middleware — compounds the MFA-gate finding.
- RSC DoS (CVE-2026-23870), Image-Optimization DoS, RSC cache poisoning, CSP-nonce XSS.
- **CVE-2025-29927** (x-middleware-subrequest, CVSS 9.1) is fixed at 14.2.25 (so 14.2.35 is patched) and additionally mitigated by the header strip — keep that rule. React2Shell RCE (CVE-2025-66478) does not affect stable 14.2.
- **Config hygiene:** `productionBrowserSourceMaps` off; no secrets in `NEXT_PUBLIC_*` (inlined into the client bundle); no stack traces from API routes. **ASVS L2: V14.3.2, V14.2.1, V7.4.1.**

**Strategic:** migrate off 14.x to 15.5.18+/16.2.6+ — the only durable fix for the May 2026 cluster, and the WebSocket SSRF has no other remediation than upgrade-or-isolate.

### 5. Container & Infrastructure

- **Docker:** non-root `USER`; `cap_drop: ALL` + minimal `cap_add`; `no-new-privileges:true`; read-only rootfs + explicit writable mounts; pinned image digests; no Docker socket mount; resource/PID limits (CIS Docker 4.1). Secrets in ENV are extractable via `docker inspect`/image layers — prefer file-based/Docker secrets (600). Keep `.env` in `.gitignore` + `.dockerignore`. Binding prod to `127.0.0.1:3000:3000` is correct. **ASVS L2: V14.1.x, V14.2.x.**
- **PostgreSQL (CIS):** no `trust` auth, no `listen_addresses='*'` + `0.0.0.0/0`; use `scram-sha-256`; least-privilege role (never superuser); TLS in transit; per-account connection limits; consider `FORCE ROW LEVEL SECURITY` even with per-instance isolation; ship pgaudit off-host; confirm no weak `postgres` password. **ASVS L2: V1.2.x, V8.x, V10.x.**
- **Cloudflare Tunnel (free tier):** hides origin IP, applies edge WAF/DDoS/CDN — but does **not** stop app-layer flaws (SSRF/MFA/IDOR pass straight through), and is void if the origin IP leaks (DNS history, LAN host, DMZ host) and the origin still answers direct requests. Lock the origin firewall to Cloudflare ranges / Tunnel-only; enable Authenticated Origin Pull; consider Cloudflare Access on admin/DMZ paths; verify no service answers on a non-tunneled port. Note Cloudflare terminates TLS at its edge (sovereignty disclosure point for tribal clients). **ASVS L2: V1.9.x, V9.x.**
- **WebSocket :3001:** authenticate at the upgrade handshake via a short-lived token (not a long-lived session in a query string that lands in logs) or first-message auth with timeout; validate `Origin` against an allowlist (CSWSH — Origin is advisory, so pair with token auth); WSS/TLS; per-message authorization; keep `BROADCAST_SECRET` server-side and rotate. If broadcasts aren't scoped per user/session, real-time data leaks across connections. **ASVS L2: V13.x, V3.x, V9.x.**
- **X-Forwarded-For trust:** behind Cloudflare, trust only `CF-Connecting-IP` / last hop; a naïve XFF read lets attackers spoof IPs to evade IP rate limiting and poison audit logs. **ASVS L2: V11.x, V7.x.**

### 6. Secrets & Deployment Pipeline

- Scan git history (gitleaks/trufflehog) and rotate anything ever committed. Security must never depend on code secrecy.
- `deploy.sh` git-pull-and-rebuild is a supply-chain/integrity risk: committed lockfile, `npm ci` (not `npm install`), audit/disable postinstall scripts (argon2 → node-pre-gyp/tar at install), verify image provenance. Review the Prisma CLI symlink workaround for path/permission side effects.
- npm audit 24/14-high is mostly dev tooling — triage so real signals aren't buried. Production-path priorities: **xlsx** (replace), **next** (migrate), **next-auth/@auth/core** beta chain (plan Better Auth). nodemailer 8.0.2 is current/fine. **ASVS L2: V14.2.1, V14.2.3, V1.14.x, V6.4.x.**

### 7. Email & External Integrations

- **SPF/DKIM/DMARC:** approval/MFA emails are security-relevant. Without DMARC `p=reject`/`quarantine` + aligned SPF+DKIM, an attacker can spoof approval emails to socially engineer privileged actions. Configure all three on `boudreaulogic.com`. **ASVS L2: V1.x.**
- **Email header injection:** validate/normalize user-controlled values flowing into headers (see GHSA-5jpx-9hw9-2fx4).
- **Approval links:** `crypto.randomBytes(32)` entropy is strong — confirm single-use, expiring, rate-limited, invalidated after use; approval state changes CSRF-protected and re-authorized server-side ("valid token" ≠ "approved"). **ASVS L2: V2.5.x, V3.x, V4.2.2.**
- **Google service account:** minimize scopes (read-only where possible), store key as a file secret, rotate, restrict connector egress. **ASVS L2: V6.4.x, V1.9.x.**
- **Webhooks:** outbound = SSRF (§3); inbound must be HMAC-signed + timestamped + replay-protected. **ASVS L2: V13.x.**

### 8. Data Protection & Audit

- **Encryption at rest (`lib/encryption.ts`):** HKDF-from-`ENCRYPTION_KEY` is a sound KDF; confirm AES-256-GCM (authenticated) with unique per-record nonces, and clarify *what* is encrypted (field-level PII vs full-row). Master key outside the image, rotatable. **ASVS L2: V6.2.x, V8.3.x, V9.x.**
- **Tamper-evident PDF / hash chain:** tamper-*evident*, not tamper-*proof* — if an attacker with DB write can recompute the whole chain, integrity is lost. Anchor chain heads to an external/append-only store (or sign with a key the app server doesn't hold); make audit writes append-only at the DB-permission level. Confirm coverage of auth events, authz failures, exports, admin actions. **ASVS L2: V7.1.x–V7.3.x.**
- **PII:** data minimization, retention limits, access logging (FERPA-adjacent for tribal colleges). **ASVS L2: V8.1.x.**
- **Backups:** encrypted at rest, restricted restore privileges, tested recovery, no plaintext OTPs/secrets in backups. **ASVS L2: V8.x.**

---

## Remediation Plan (staged, with benchmarks)

### Stage 0 — Emergency (0–72h)
1. **MFA + revocation guard on every API route / Server Action.** Stop trusting middleware as the boundary. *Benchmark:* a password-only session gets 401/403 from all `/api/*` data endpoints. *(Fix the `!pathname.startsWith('/api/')` exclusion and/or enforce in the session callback + a shared route guard.)*
2. **OTP hardening:** attempt cap (5), ≤5 min TTL, single-use, hashed storage. *Benchmark:* >5 wrong codes invalidates the code and blocks further attempts.
3. **WebSocket SSRF (CVE-2026-44578):** no 14.x patch — don't expose the Node origin directly; block WS upgrades at edge/origin where unneeded; restrict origin egress to known ranges (block metadata IPs).
4. **Lockout/limiter rework:** IP+account exponential backoff + CAPTCHA; move limiter state to a shared, restart-durable store.

### Stage 1 — Near-term (1–4 weeks)
5. **Begin Next.js 15.5.18 / 16.2.6 migration** — the only durable fix for the May 2026 cluster. *Benchmark:* `next --version` ≥ 15.5.18.
6. **Replace xlsx** with `@e965/xlsx` or SheetJS 0.20.2+ CDN build; add CSV-export formula-injection escaping.
7. **Audit the formula evaluator;** if `eval`/`Function`-based, replace with a sandboxed AST interpreter (time/recursion/ReDoS bounds).
8. **Harden `ssrfProtection`** (DNS pinning + allowlist + redirect re-validation); verify all connectors + webhooks route through it.
9. **Container + Postgres hardening** (non-root, cap_drop, no-new-privileges, read-only fs, file secrets; scram-sha-256, no trust, least-priv role, TLS).

### Stage 2 — Structural (1–3 months)
10. Adopt Better Auth or DB-session strategy for instant revocation; shorten absolute session timeout for sovereign data.
11. SPF/DKIM/DMARC (`p=reject`); sign inbound webhooks; minimize Google scopes.
12. Anchor the audit hash chain externally; append-only audit writes; encrypt PII columns + audit at rest with a rotatable key.
13. Secret-scan git history + rotate; harden `deploy.sh` (`npm ci`, lockfile, no postinstall); lock origin firewall to Cloudflare-only.
14. Full ASVS L2 verification pass → produce the client-facing artifact.

**Thresholds that change the plan:** regulated student/health PII → escalate V2/V3/V6 to ASVS L3. WebSocket carries cross-user data → its auth model is CRITICAL until per-message authz is proven. Origin answers direct (non-tunneled) requests → all Cloudflare-tier protections are void until the origin firewall is locked.

---

## Caveats
- The deep-research pass ran **without repo access**; its code-level claims are contingent except where §0a marks them CONFIRMED. Verify the rest against source.
- GHSA-5jpx-9hw9-2fx4 is fixed precisely at beta.30 (the pinned version) — correct today, fragile; guard the pin.
- ASVS IDs use the familiar V4.0.x numbering; remap to ASVS 5.0.0 (`v5.0.0-<chapter>.<section>.<req>`) in the client artifact if the client mandates 5.0.
- Several May 2026 Next.js advisories shipped with minimal lead time and no public PoC at disclosure; the WebSocket SSRF was independently assessed as broadly exploitable across self-hosted hosts.
