# Agora Dockerfile - Multi-stage build
# Base stage
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps
RUN npm rebuild argon2 --build-from-source

# Development stage
FROM base AS development
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV OPENSSL_CONF=/dev/null
RUN npx prisma generate
EXPOSE 3000
ENV PORT 3000
CMD ["npm", "run", "dev"]

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED 1
RUN NODE_OPTIONS="--max-old-space-size=8192" npm run build

# Production stage
FROM base AS production
WORKDIR /app
ENV NODE_ENV production
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/server ./.next/server

# Copy Prisma files — generated client, schema/migrations, and the CLI
# The CLI is needed so the entrypoint can run `prisma migrate deploy` on startup
# using the project-pinned version instead of any globally installed Prisma.
# `@prisma/*` is the CLI's full runtime tree (engines, fetch-engine, get-platform,
# debug, engines-version) — without it the CLI dies with
# `Cannot find module '@prisma/engines'`. The whole scope is self-contained
# (every package depends only on other @prisma/* packages) so one COPY suffices.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/prisma ./prisma

# Create uploads directory
RUN mkdir -p /app/uploads/templates && chown -R nextjs:nodejs /app/uploads

# IPv4 preload — loaded via NODE_OPTIONS=--require before the server starts
# (see docker-compose.yml). Forces outbound connections onto IPv4 because
# Docker Desktop's bridge has no routable IPv6. Done as a Node preload rather
# than Next's instrumentation hook, which doesn't fire in standalone output.
COPY preload-ipv4.js ./preload-ipv4.js

# Copy entrypoint script.
# Strip any CR (Windows CRLF) from the shebang so the kernel can find /bin/sh —
# checkouts on Windows can introduce CRLF and break `exec`.
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 3000
ENV PORT 3000

# Run directly as the unprivileged nextjs user. The compose hardening
# (`cap_drop: ALL` + `no-new-privileges`) strips CAP_SETUID/SETGID/CHOWN, so the
# old "start as root, chown uploads, then `su` to nextjs" pattern could not drop
# privileges and crash-looped. The uploads named volume is already initialised
# nextjs:nodejs from this image, so no runtime chown is needed.
USER nextjs

ENTRYPOINT ["/app/docker-entrypoint.sh"]