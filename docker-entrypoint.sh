#!/bin/sh
# Fix upload directory permissions on startup
# (Docker volume mount overrides Dockerfile permissions)
mkdir -p /app/uploads/templates
chown -R nextjs:nodejs /app/uploads
chmod -R 775 /app/uploads

# Run Prisma migrations via node directly (avoids symlink issues with multi-stage COPY)
node node_modules/prisma/build/index.js migrate deploy

# Drop to nextjs user and start the app
exec su -s /bin/sh nextjs -c "node server.js"