#!/bin/sh
# Fix upload directory permissions on startup
# (Docker volume mount overrides Dockerfile permissions)
mkdir -p /app/uploads/templates
chown -R nextjs:nodejs /app/uploads
chmod -R 775 /app/uploads

# Run Prisma migrations. Try the pinned CLI directly (no symlink); if the CLI
# package somehow isn't present in the image, log loudly rather than failing
# silently so the operator knows migrations must be applied manually.
if [ -f node_modules/prisma/build/index.js ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  node node_modules/prisma/build/index.js migrate deploy || echo "[entrypoint] WARNING: migrate deploy failed — apply migrations manually."
else
  echo "[entrypoint] WARNING: prisma CLI not found in image — migrations NOT applied. Apply them manually via psql."
fi

# Drop to nextjs user and start the app
exec su -s /bin/sh nextjs -c "node server.js"