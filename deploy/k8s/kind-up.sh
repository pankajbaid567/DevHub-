#!/usr/bin/env bash
# Spins up DevHub+ on a local kind cluster:  ./deploy/k8s/kind-up.sh   (then open :8080)
# Tear down with:                           kind delete cluster --name devhub
set -euo pipefail
cd "$(dirname "$0")/../.."

kind get clusters | grep -qx devhub || kind create cluster --name devhub --wait 120s

for svc in api web runner; do
  docker build -q -f "apps/$svc/Dockerfile" -t "devhub-$svc:kind" . >/dev/null
  kind load docker-image "devhub-$svc:kind" --name devhub
done

kubectl apply -k deploy/k8s/overlays/kind
kubectl -n devhub rollout status statefulset/postgres --timeout=180s
kubectl -n devhub rollout status deployment/redis --timeout=120s
kubectl -n devhub rollout status deployment/runner --timeout=120s
kubectl -n devhub rollout status deployment/api --timeout=300s
kubectl -n devhub rollout status deployment/web --timeout=120s
echo "Ready: kubectl -n devhub port-forward svc/web 8080:80  ->  http://localhost:8080"
