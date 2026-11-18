#!/usr/bin/env sh
# Fails if the migrated database differs from prisma/schema.prisma.
# Prisma cannot express pgvector HNSW indexes, so the diff always proposes dropping them;
# those (and only those) lines are allowed.
set -eu
diff=$(npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null)
unexpected=$(printf '%s\n' "$diff" | grep -v '^--' | grep -v '^\s*$' | grep -v '_hnsw"' || true)
if [ -n "$unexpected" ]; then
  echo "Schema drift: migrations do not match schema.prisma:"
  printf '%s\n' "$unexpected"
  exit 1
fi
echo "No schema drift."
