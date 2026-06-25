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
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/prisma ./prisma

# Create uploads directory
RUN mkdir -p /app/uploads/templates && chown -R nextjs:nodejs /app/uploads

# Copy entrypoint script (runs as root to fix permissions, then drops to nextjs)
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000
ENV PORT 3000

# Run as root so entrypoint can fix permissions, then it drops to nextjs
ENTRYPOINT ["/app/docker-entrypoint.sh"]