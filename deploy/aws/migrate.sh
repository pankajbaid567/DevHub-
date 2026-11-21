#!/usr/bin/env bash
# Run Prisma migrations via ECS Exec on the API service.
# Usage: ./migrate.sh
#
# The API's docker-entrypoint.sh runs migrations automatically on startup,
# but this script is useful for ad-hoc migration runs or to enable pgvector.

set -euo pipefail

PROFILE="${AWS_PROFILE:-pankaj-aws}"
REGION="ap-south-1"
CLUSTER="devhub"
SERVICE="devhub-api"

TASK_ARN=$(aws ecs list-tasks \
  --cluster "$CLUSTER" --service-name "$SERVICE" \
  --profile "$PROFILE" --region "$REGION" \
  --query 'taskArns[0]' --output text)

if [[ "$TASK_ARN" == "None" || -z "$TASK_ARN" ]]; then
  echo "ERROR: No running API tasks found"
  exit 1
fi

echo "Running Prisma migrate on task: $TASK_ARN"

# Enable pgvector extension (idempotent)
aws ecs execute-command \
  --cluster "$CLUSTER" \
  --task "$TASK_ARN" \
  --container api \
  --interactive \
  --profile "$PROFILE" --region "$REGION" \
  --command "node -e \"
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\\\$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector')
      .then(() => console.log('pgvector extension enabled'))
      .then(() => p.\\\$disconnect())
      .catch(e => { console.error(e); process.exit(1); });
  \""

# Run Prisma migrations
aws ecs execute-command \
  --cluster "$CLUSTER" \
  --task "$TASK_ARN" \
  --container api \
  --interactive \
  --profile "$PROFILE" --region "$REGION" \
  --command "npx prisma migrate deploy"

echo "Migration complete!"
