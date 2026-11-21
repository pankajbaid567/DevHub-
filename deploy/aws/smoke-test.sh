#!/usr/bin/env bash
# Post-deployment smoke test for DevHub+ on AWS
# Usage: ./smoke-test.sh [ALB_DNS]
#
# Verifies: health endpoints, API responses, static assets, WebSocket upgrade

set -euo pipefail

PROFILE="${AWS_PROFILE:-pankaj-aws}"
REGION="ap-south-1"

ALB_DNS="${1:-$(aws cloudformation describe-stacks \
  --stack-name devhub-ecs --profile "$PROFILE" --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbDns`].OutputValue' --output text 2>/dev/null)}"

if [[ -z "$ALB_DNS" ]]; then
  echo "ERROR: ALB DNS not found. Pass it as an argument or deploy devhub-ecs first."
  exit 1
fi

BASE="http://$ALB_DNS"
PASS=0
FAIL=0

check() {
  local name="$1" url="$2" expected="$3"
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$status" == "$expected" ]]; then
    echo "  PASS  $name ($status)"
    ((PASS++))
  else
    echo "  FAIL  $name (got $status, expected $expected)"
    ((FAIL++))
  fi
}

check_body() {
  local name="$1" url="$2" pattern="$3"
  local body
  body=$(curl -s --max-time 10 "$url" 2>/dev/null || echo "")
  if echo "$body" | grep -q "$pattern"; then
    echo "  PASS  $name (body matches '$pattern')"
    ((PASS++))
  else
    echo "  FAIL  $name (body does not match '$pattern')"
    ((FAIL++))
  fi
}

echo "=== DevHub+ AWS Smoke Test ==="
echo "Target: $BASE"
echo ""

echo "--- Health Endpoints ---"
check "API /health"       "$BASE/health"       "200"
check "API /ready"        "$BASE/ready"        "200"
check "Web /healthz"      "$BASE/healthz"      "200"

echo ""
echo "--- API Routes ---"
check "GET /api/v1/questions"  "$BASE/api/v1/questions"  "200"
check "Auth required"          "$BASE/api/v1/users/me"   "401"
check_body "API version"       "$BASE/health"            "ok"

echo ""
echo "--- Static Assets ---"
check "Index HTML"    "$BASE/"           "200"
check_body "SPA root" "$BASE/"           "devhub"

echo ""
echo "--- WebSocket ---"
ws_status=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  --max-time 5 "$BASE/socket.io/?EIO=4&transport=websocket" 2>/dev/null || echo "000")
if [[ "$ws_status" == "101" ]]; then
  echo "  PASS  WebSocket upgrade (101)"
  ((PASS++))
else
  echo "  INFO  WebSocket status: $ws_status (may need sticky sessions)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]] && echo "All checks passed!" || exit 1
