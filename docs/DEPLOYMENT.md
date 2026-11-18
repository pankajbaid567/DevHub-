# Deployment

DevHub+ ships three images (`apps/api`, `apps/web`, `apps/runner`) and depends on PostgreSQL 16 with pgvector, Redis 7 and, optionally, SMTP. There are two supported ways to run it.

## Docker Compose (single host)

```bash
cp .env.example .env            # set JWT_ACCESS_SECRET and RUNNER_TOKEN
docker compose up -d --build --scale api=3
docker compose --profile observability up -d   # optional: Prometheus :9090, Grafana :3001
```

nginx (in the web image) serves the SPA, applies the CSP and balances the API replicas. Redis holds Socket.IO pub/sub, caches, rate limits and BullMQ jobs (with AOF persistence). The runner sits on an internal network with no internet route.

## Kubernetes (Kustomize)

```bash
./deploy/k8s/kind-up.sh                                 # local cluster, everything in-cluster
kubectl -n devhub port-forward svc/web 8080:80         # http://localhost:8080
kind delete cluster --name devhub                       # tear down
```

`deploy/k8s/base` is environment-neutral; `overlays/kind` adds in-cluster Postgres (pgvector) and Redis, development secrets and side-loaded images. A production overlay would instead point `DATABASE_URL` and `REDIS_URL` at managed services, pull images from a registry by digest and source secrets from External Secrets or Sealed Secrets.

| Concern | How the manifests handle it |
|---|---|
| **Pod security** | The namespace enforces the *restricted* Pod Security Standard. Every container is non-root, has `allowPrivilegeEscalation: false`, drops all capabilities, uses the `RuntimeDefault` seccomp profile and (except Postgres) a read-only root filesystem with in-memory `/tmp`. The web image is unprivileged nginx on port 8080. |
| **Migrations** | An init container runs `prisma migrate deploy` before each API pod starts. Prisma serialises concurrent runs with an advisory lock, so a rollout of N pods is safe. |
| **Zero-downtime rollouts** | `maxUnavailable: 0, maxSurge: 1`; startup, readiness (`/ready`: Postgres + Redis) and liveness (`/health`) probes; 30 s termination grace for the graceful shutdown (documents flushed, jobs drained). |
| **Scaling** | HPA on CPU (2 to 10 API pods, 5-minute scale-down stabilisation so sockets don't churn), topology spread across nodes, PodDisruptionBudgets for API and web. |
| **Realtime** | Socket.IO rooms span pods through the Redis adapter. The Ingress uses cookie affinity on `/api` and `/socket.io` for the long-polling fallback, with long proxy timeouts for WebSockets. |
| **Runner isolation** | No service-account token, no service links, `shareProcessNamespace` (the pause container reaps orphans), CPU and memory limits, and a NetworkPolicy that allows ingress only from the API and **no egress at all**. `runtimeClassName: gvisor` is one line away for public traffic. |
| **Network policy** | Only the web tier and the ingress controller may reach the API. Enforcement needs a policy-capable CNI (Calico, Cilium); kind's default CNI ignores policies. |
| **Verified** | Deployed to a local kind cluster: all pods admitted under *restricted*, migrations applied by the init containers (after retrying until Postgres was ready), demo data seeded, sign-in, hybrid search, a TypeScript run in the sandbox pod and a WebSocket session join through nginx all worked. Note that the HPA needs metrics-server (`kubectl apply -f` the upstream manifest), and kind doesn't enforce NetworkPolicy without a policy-capable CNI. |
| **Observability** | Prometheus scrape annotations on API pods (`/metrics`), and the same dashboard as the Compose profile. |

## Production checklist

- Set `COOKIE_SECURE=true` and serve over HTTPS (cert-manager on the Ingress).
- Set random `JWT_ACCESS_SECRET` (at least 32 characters) and `RUNNER_TOKEN`.
- Postgres 14+ with the `vector` extension available. The migration creates it.
- `TRUST_PROXY` = the number of proxies in front of the API (the Ingress plus any load balancer).
- Real SMTP with SPF, DKIM and DMARC; OAuth callback URLs registered with GitHub and Google.
- Redis with persistence and `maxmemory-policy noeviction` (required by BullMQ).
- At least one API replica with `WORKER_ENABLED=true`. Optionally run dedicated worker replicas and set `false` on the web-facing ones.
