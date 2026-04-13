# =============================================================================
# Agora Maintenance Container
# Lightweight Alpine-based daemon for automated cleanup
# Typically ~50MB image size
# =============================================================================

FROM node:20-alpine

# Install Docker CLI (for docker system prune commands)
RUN apk add --no-cache docker-cli

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production && npm cache clean --force

# Copy maintenance script
COPY maintenance.js ./

# Create log directory
RUN mkdir -p /var/log/agora-maintenance

# Run as non-root (but needs docker group for Docker socket)
# Note: docker group GID must match host — handled in docker-compose

ENV NODE_ENV=production

CMD ["node", "maintenance.js"]