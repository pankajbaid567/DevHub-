#!/usr/bin/env sh
# Fails if the migrated database differs from prisma/schema.prisma.
# Prisma cannot express pgvector HNSW indexes, so the diff always proposes dropping them;
# those (and only those) lines are allowed.
set -eu
# No 2>/dev/null: if the diff itself fails (bad flags, no database), set -e stops with its error.
diff=$(npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script)
unexpected=$(printf '%s\n' "$diff" | grep -v '^--' | grep -v '^\s*$' | grep -v '_hnsw"' || true)
if [ -n "$unexpected" ]; then
  echo "Schema drift: migrations do not match schema.prisma:"
  printf '%s\n' "$unexpected"
  exit 1
fi
echo "No schema drift."
