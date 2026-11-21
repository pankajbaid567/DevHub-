#!/usr/bin/env bash
# DevHub+ AWS deployment script
# Usage: ./deploy.sh [--skip-build] [--stack vpc|data|ecs|all]
#
# Prerequisites:
#   - AWS CLI v2 authenticated (aws login --profile pankaj-aws)
#   - Docker running (for image builds)
#   - jq installed
#
# Architecture (HLD):
#   VPC (public/private subnets) → ALB → ECS Fargate (api, web)
#                                        ECS Fargate (runner, isolated)
#   Private subnets: RDS PostgreSQL 16 + pgvector, ElastiCache Serverless (Valkey)

set -euo pipefail

PROFILE="${AWS_PROFILE:-pankaj-aws}"
REGION="ap-south-1"
ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SKIP_BUILD=false
STACK="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    --stack) STACK="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "$(date +%H:%M:%S) [deploy] $*"; }

wait_stack() {
  local stack_name="$1"
  log "Waiting for stack $stack_name..."
  aws cloudformation wait stack-create-complete \
    --stack-name "$stack_name" --profile "$PROFILE" --region "$REGION" 2>/dev/null \
  || aws cloudformation wait stack-update-complete \
    --stack-name "$stack_name" --profile "$PROFILE" --region "$REGION" 2>/dev/null \
  || true
  local status
  status=$(aws cloudformation describe-stacks \
    --stack-name "$stack_name" --profile "$PROFILE" --region "$REGION" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DOES_NOT_EXIST")
  if [[ "$status" == *ROLLBACK* || "$status" == *FAILED* ]]; then
    log "ERROR: Stack $stack_name is in $status"
    aws cloudformation describe-stack-events \
      --stack-name "$stack_name" --profile "$PROFILE" --region "$REGION" \
      --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
      --output table
    exit 1
  fi
  log "Stack $stack_name: $status"
}

deploy_stack() {
  local stack_name="$1"
  local template="$2"
  shift 2
  local params=("$@")

  log "Deploying stack: $stack_name"
  local status
  status=$(aws cloudformation describe-stacks \
    --stack-name "$stack_name" --profile "$PROFILE" --region "$REGION" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DOES_NOT_EXIST")

  if [[ "$status" == "DOES_NOT_EXIST" ]]; then
    aws cloudformation create-stack \
      --stack-name "$stack_name" \
      --template-body "file://$template" \
      --capabilities CAPABILITY_NAMED_IAM \
      --profile "$PROFILE" --region "$REGION" \
      "${params[@]+"${params[@]}"}"
  else
    aws cloudformation update-stack \
      --stack-name "$stack_name" \
      --template-body "file://$template" \
      --capabilities CAPABILITY_NAMED_IAM \
      --profile "$PROFILE" --region "$REGION" \
      "${params[@]+"${params[@]}"}" 2>/dev/null || {
        log "No updates needed for $stack_name"
        return 0
      }
  fi
  wait_stack "$stack_name"
}

# --- ECR repositories ---
create_ecr_repo() {
  local name="$1"
  if aws ecr describe-repositories --repository-names "$name" \
      --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
    log "ECR repo $name already exists"
  else
    log "Creating ECR repo: $name"
    aws ecr create-repository \
      --repository-name "$name" \
      --image-scanning-configuration scanOnPush=true \
      --image-tag-mutability MUTABLE \
      --encryption-configuration encryptionType=AES256 \
      --profile "$PROFILE" --region "$REGION" \
      --output json
  fi
}

# --- Build and push Docker images ---
build_and_push() {
  if [[ "$SKIP_BUILD" == "true" ]]; then
    log "Skipping Docker builds (--skip-build)"
    return 0
  fi

  log "Authenticating Docker to ECR..."
  aws ecr get-login-password --region "$REGION" --profile "$PROFILE" \
    | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

  local tag
  tag=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "latest")

  for svc in api web runner; do
    local repo="devhub-$svc"
    local image="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$repo:$tag"
    local dockerfile="$PROJECT_ROOT/apps/$svc/Dockerfile"
    # Use AWS-specific Dockerfile for web (ALB handles API routing)
    [[ "$svc" == "web" && -f "$PROJECT_ROOT/apps/web/Dockerfile.aws" ]] && \
      dockerfile="$PROJECT_ROOT/apps/web/Dockerfile.aws"
    log "Building $repo ($tag)..."
    docker build \
      --platform linux/amd64 \
      -t "$repo:$tag" \
      -f "$dockerfile" \
      "$PROJECT_ROOT"
    docker tag "$repo:$tag" "$image"
    log "Pushing $image..."
    docker push "$image"
    # Also tag as latest
    docker tag "$repo:$tag" "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$repo:latest"
    docker push "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$repo:latest"
  done
  log "All images pushed. Tag: $tag"
}

# --- Main ---
log "Account: $ACCOUNT_ID | Region: $REGION"

if [[ "$STACK" == "all" || "$STACK" == "vpc" ]]; then
  deploy_stack "devhub-vpc" "$SCRIPT_DIR/vpc.yaml"
fi

if [[ "$STACK" == "all" || "$STACK" == "ecr" ]]; then
  for repo in devhub-api devhub-web devhub-runner; do
    create_ecr_repo "$repo"
  done
fi

if [[ "$STACK" == "all" || "$STACK" == "build" ]]; then
  build_and_push
fi

if [[ "$STACK" == "all" || "$STACK" == "data" ]]; then
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    echo "ERROR: Set DB_PASSWORD environment variable before deploying data stack"
    echo "  export DB_PASSWORD='YourSecurePassword123!'"
    exit 1
  fi
  deploy_stack "devhub-data" "$SCRIPT_DIR/database.yaml" \
    --parameters \
      "ParameterKey=DbMasterPassword,ParameterValue=$DB_PASSWORD"
fi

if [[ "$STACK" == "all" || "$STACK" == "ecs" ]]; then
  if [[ -z "${DB_PASSWORD:-}" || -z "${JWT_SECRET:-}" ]]; then
    echo "ERROR: Set DB_PASSWORD and JWT_SECRET environment variables"
    echo "  export DB_PASSWORD='YourSecurePassword123!'"
    echo "  export JWT_SECRET=\$(openssl rand -base64 48)"
    exit 1
  fi

  local_db_endpoint=$(aws cloudformation describe-stacks \
    --stack-name devhub-data --profile "$PROFILE" --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`DbEndpoint`].OutputValue' --output text)
  local_cache_endpoint=$(aws cloudformation describe-stacks \
    --stack-name devhub-data --profile "$PROFILE" --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CacheEndpoint`].OutputValue' --output text)
  local_alb_dns=$(aws cloudformation describe-stacks \
    --stack-name devhub-ecs --profile "$PROFILE" --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlbDns`].OutputValue' --output text 2>/dev/null || echo "")

  deploy_stack "devhub-ecs" "$SCRIPT_DIR/ecs.yaml" \
    --parameters \
      "ParameterKey=AccountId,ParameterValue=$ACCOUNT_ID" \
      "ParameterKey=Region,ParameterValue=$REGION" \
      "ParameterKey=DbEndpoint,ParameterValue=$local_db_endpoint" \
      "ParameterKey=DbPassword,ParameterValue=$DB_PASSWORD" \
      "ParameterKey=CacheEndpoint,ParameterValue=$local_cache_endpoint" \
      "ParameterKey=JwtSecret,ParameterValue=$JWT_SECRET" \
      "ParameterKey=GeminiApiKey,ParameterValue=${GEMINI_API_KEY:-}" \
      "ParameterKey=PublicUrl,ParameterValue=${PUBLIC_URL:-http://$local_alb_dns}" \
      "ParameterKey=RunnerToken,ParameterValue=${RUNNER_TOKEN:-devhub-runner-prod-token}"
fi

log "Deployment complete!"
if [[ "$STACK" == "all" || "$STACK" == "ecs" ]]; then
  alb_dns=$(aws cloudformation describe-stacks \
    --stack-name devhub-ecs --profile "$PROFILE" --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlbDns`].OutputValue' --output text 2>/dev/null || echo "pending")
  log "ALB URL: http://$alb_dns"
fi
