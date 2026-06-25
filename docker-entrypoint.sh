#!/bin/sh
# This container runs as the unprivileged `nextjs` user (see Dockerfile `USER`).
# The compose hardening (`cap_drop: ALL` + `no-new-privileges`) removes CAP_CHOWN
# and CAP_SETUID/SETGID, so we neither chown the uploads volume nor `su` here —
# both would fail with "Operation not permitted". The uploads named volume is
# already owned nextjs:nodejs (initialised from this image), so writes just work.
mkdir -p /app/uploads/templates

# Run Prisma migrations using the project-pinned CLI directly (no symlink).
# If the CLI package somehow isn't present in the image, log loudly rather than
# failing silently so the operator knows migrations must be applied manually.
if [ -f node_modules/prisma/build/index.js ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  node node_modules/prisma/build/index.js migrate deploy || echo "[entrypoint] WARNING: migrate deploy failed — apply migrations manually."
else
  echo "[entrypoint] WARNING: prisma CLI not found in image — migrations NOT applied. Apply them manually via psql."
fi

# Start the app (already running as nextjs).
exec node server.js
