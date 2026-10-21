#!/bin/sh
# Seed sample files on first start, then run the server.
set -e
mkdir -p "$LE_DESIGNS" "$LE_LIBRARIES"
if [ -z "$(ls -A "$LE_DESIGNS" 2>/dev/null)" ]; then cp -n /app/seed/designs/*.json "$LE_DESIGNS"/ 2>/dev/null || true; fi
if [ -z "$(ls -A "$LE_LIBRARIES" 2>/dev/null)" ]; then cp -n /app/seed/libraries/*.json "$LE_LIBRARIES"/ 2>/dev/null || true; fi
exec node server.js
