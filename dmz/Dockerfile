FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy DMZ proxy config
COPY nginx.conf /etc/nginx/conf.d/agora-dmz.conf

# Create certbot webroot
RUN mkdir -p /var/www/certbot

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 0

EXPOSE 80 443