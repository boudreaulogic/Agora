#!/bin/bash
set -e

echo "==> Pulling latest from GitHub..."
git pull origin main

echo "==> Rebuilding and restarting containers..."
docker compose up --build -d

echo "==> Done! Agora is running on the latest code from GitHub."
