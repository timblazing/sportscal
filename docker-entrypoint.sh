#!/bin/sh
set -e
# Apply database migrations before starting (set RUN_MIGRATIONS=false to skip).
if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  node ./migrate.mjs
fi
exec node server.js
