#!/usr/bin/env bash
# Deploy DevHub+ to EC2 via SSM — clones repo, builds, and runs docker compose.
# Usage: ./deploy-ec2.sh
#
# Architecture: everything on one t4g.small behind Caddy reverse proxy.
# Cost: ~$16/month (EC2 + EBS + EIP, all covered by FREE tier credits).

set -euo pipefail

PROFILE="${AWS_PROFILE:-pankaj-aws}"
REGION="ap-south-1"
INSTANCE_ID="i-0b6ba9aa600049792"
DEPLOY_DIR="/opt/devhub"
SUBDOMAIN="devhub.3-109-36-90.sslip.io"

log() { echo "$(date +%H:%M:%S) [deploy] $*"; }

ssm_run() {
  local desc="$1"
  shift
  log "$desc"
  local cmd_id
  cmd_id=$(aws ssm send-command --profile "$PROFILE" --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --timeout-seconds 600 \
    --parameters "commands=$1" \
    --output text --query 'Command.CommandId' 2>&1)

  # Poll for completion
  local status="InProgress"
  while [[ "$status" == "InProgress" || "$status" == "Pending" ]]; do
    sleep 5
    status=$(aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
      --command-id "$cmd_id" --instance-id "$INSTANCE_ID" \
      --query 'Status' --output text 2>&1)
  done

  local output
  output=$(aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
    --command-id "$cmd_id" --instance-id "$INSTANCE_ID" \
    --query '{Output:StandardOutputContent,Error:StandardErrorContent}' --output json 2>&1)
  echo "$output" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Output','')[:2000]); e=d.get('Error',''); e and print('STDERR:',e[:500])" 2>/dev/null || echo "$output"

  if [[ "$status" != "Success" ]]; then
    log "ERROR: Command failed with status $status"
    return 1
  fi
}

log "Deploying DevHub+ to EC2 $INSTANCE_ID"

# Step 1: Clone or pull the repo
ssm_run "Cloning/updating repo" '[
  "set -e",
  "if [ -d '"$DEPLOY_DIR"' ]; then cd '"$DEPLOY_DIR"' && git pull origin main; else git clone https://github.com/pankajbaid567/DevHub-.git '"$DEPLOY_DIR"'; fi",
  "cd '"$DEPLOY_DIR"' && git log --oneline -1"
]'

# Step 2: Create .env.aws if it doesn't exist
ssm_run "Setting up environment" '[
  "set -e",
  "cd '"$DEPLOY_DIR"'",
  "if [ ! -f .env.aws ]; then cp env.aws.example .env.aws && JWT=$(openssl rand -base64 48) && sed -i \"s|CHANGE_ME_openssl_rand_base64_48|$JWT|\" .env.aws && echo Created .env.aws with generated JWT secret; else echo .env.aws already exists; fi",
  "cat .env.aws | grep -v SECRET | grep -v PASSWORD | grep -v KEY | grep -v TOKEN"
]'

# Step 3: Build and start containers
ssm_run "Building Docker images (this takes a few minutes)" '[
  "set -e",
  "cd '"$DEPLOY_DIR"'",
  "docker compose -f docker-compose.aws.yml build --parallel 2>&1 | tail -20"
]'

ssm_run "Starting services" '[
  "set -e",
  "cd '"$DEPLOY_DIR"'",
  "docker compose -f docker-compose.aws.yml up -d 2>&1",
  "sleep 10",
  "docker compose -f docker-compose.aws.yml ps"
]'

# Step 4: Add Caddy subdomain config
ssm_run "Configuring Caddy reverse proxy" '[
  "set -e",
  "CADDYFILE=$(docker exec caddy cat /etc/caddy/Caddyfile 2>/dev/null)",
  "if echo \"$CADDYFILE\" | grep -q \"'"$SUBDOMAIN"'\"; then echo Caddy already configured for '"$SUBDOMAIN"'; exit 0; fi",
  "docker exec caddy sh -c \"cat >> /etc/caddy/Caddyfile << EOF\n\n'"$SUBDOMAIN"' {\n  encode gzip\n  handle /api/* {\n    reverse_proxy 127.0.0.1:4000\n  }\n  handle /socket.io/* {\n    reverse_proxy 127.0.0.1:4000\n  }\n  handle /health {\n    reverse_proxy 127.0.0.1:4000\n  }\n  handle /ready {\n    reverse_proxy 127.0.0.1:4000\n  }\n  handle /metrics {\n    reverse_proxy 127.0.0.1:4000\n  }\n  handle {\n    reverse_proxy 127.0.0.1:8080\n  }\n  header {\n    Strict-Transport-Security \\\"max-age=31536000\\\"\n    X-Content-Type-Options \\\"nosniff\\\"\n    X-Frame-Options \\\"DENY\\\"\n  }\n}\nEOF\"",
  "docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>&1",
  "echo Caddy configured for '"$SUBDOMAIN"'"
]'

# Step 5: Smoke test
ssm_run "Running smoke tests" '[
  "set -e",
  "sleep 5",
  "echo Health check:",
  "curl -sf http://127.0.0.1:4000/health && echo OK || echo FAIL",
  "echo Ready check:",
  "curl -sf http://127.0.0.1:4000/ready && echo OK || echo FAIL",
  "echo Web check:",
  "curl -sf http://127.0.0.1:8080/healthz && echo OK || echo FAIL",
  "echo All containers:",
  "docker compose -f '"$DEPLOY_DIR"'/docker-compose.aws.yml ps --format \"table {{.Name}}\t{{.Status}}\""
]'

log "Deployment complete!"
log "URL: https://$SUBDOMAIN"
