#!/bin/sh
# Apply pending migrations, optionally seed demo data, then hand PID 1 to the server
# (exec) so it receives SIGTERM directly and shuts down gracefully.
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npx prisma migrate deploy
fi
if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  node dist/seed.js
fi
exec "$@"
