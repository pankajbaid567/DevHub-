# DevHub+ AWS Architecture

## High-Level Design (HLD)

### System Context

```
                    ┌─────────────┐
                    │   Internet  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │     ALB     │  (public subnets, HTTP:80)
                    │ path-based  │
                    │   routing   │
                    └──┬──────┬───┘
                       │      │
              /api/*   │      │  /*
           /socket.io  │      │
                       │      │
                 ┌─────▼──┐ ┌─▼──────┐
                 │  API   │ │  Web   │   (private subnets, Fargate)
                 │ :4000  │ │ :8080  │
                 └──┬──┬──┘ └────────┘
                    │  │
           ┌────────┘  └─────────┐
           │                     │
     ┌─────▼─────┐        ┌─────▼─────┐
     │    RDS     │        │ElastiCache│   (private subnets)
     │ Pg16+pgvec│        │ Valkey    │
     └───────────┘        └───────────┘
           │
     ┌─────▼─────┐
     │  Runner   │   (private subnet, isolated — API-only ingress)
     │  :2000    │
     └───────────┘
```

### Service Boundaries

| Service | Responsibility | Scaling |
|---------|---------------|---------|
| API | REST endpoints, WebSocket (Socket.IO), background jobs (BullMQ) | Horizontal (ECS desired count) |
| Web | Static SPA + nginx reverse proxy | Horizontal (ECS desired count) |
| Runner | Sandboxed code execution (Node.js, Python) | Vertical (CPU/memory limits) |
| RDS | Persistent storage, full-text search, vector embeddings (pgvector) | Vertical (instance class) |
| ElastiCache | Session cache, pub/sub adapter, rate limiting, job queue | Auto-scales (Serverless) |

### Design Patterns Applied

- **Strategy Pattern**: AI provider interface (`AIProvider`) — swap Gemini for Bedrock without code changes
- **Observer Pattern**: `EventBus` decouples domain events from side effects (notifications, embeddings)
- **Dependency Injection**: Composition root (`container.ts`) wires all services
- **Circuit Breaker**: ECS deployment circuit breaker with auto-rollback
- **Transactional Outbox**: Reliable event delivery across service boundaries

## Low-Level Design (LLD)

### Network Architecture

```
VPC: 10.0.0.0/16
├── Public Subnets (AZ a, b)
│   ├── 10.0.1.0/24 — ALB, NAT Gateway
│   └── 10.0.2.0/24 — ALB (multi-AZ)
├── Private Subnets (AZ a, b)
│   ├── 10.0.3.0/24 — ECS tasks, RDS, ElastiCache
│   └── 10.0.4.0/24 — ECS tasks, RDS standby
└── NAT Gateway — single (cost-optimized for FREE tier)
```

### Security Groups (Least Privilege)

```
ALB SG ──────────► ECS API SG ──────────► RDS SG (5432)
  (80, 443)          (4000)                ElastiCache SG (6379)
                     │
ALB SG ──────────► ECS Web SG
                     (8080)

ECS API SG ──────► ECS Runner SG (2000)
```

### Resource Sizing (FREE Tier Optimized)

| Resource | Spec | Monthly Cost |
|----------|------|-------------|
| RDS db.t4g.micro | 2 vCPU, 1 GB, 20 GB gp3 | ~$12 (covered by credits) |
| ElastiCache Serverless | 100 MB floor, auto-scale | ~$6 (covered by credits) |
| ECS Fargate (API) | 0.25 vCPU, 512 MB | ~$9 |
| ECS Fargate (Web) | 0.25 vCPU, 256 MB | ~$7 |
| ECS Fargate (Runner) | 0.25 vCPU, 512 MB | ~$9 |
| NAT Gateway | Per-hour + data | ~$32 |
| ALB | Per-hour + LCU | ~$16 |
| CloudWatch Logs | 14-day retention | ~$2 |
| **Total estimated** | | **~$93/month** |

### IAM Roles (Interface Segregation Principle)

- **EcsTaskExecutionRole**: Pull images from ECR, write to CloudWatch Logs
- **EcsTaskRole**: Application-level permissions (none initially, add as needed)

### Data Flow

1. Client → ALB (HTTP:80) → path routing
2. `/api/*`, `/socket.io/*` → API service (Fargate)
3. `/*` → Web service (nginx serves SPA, proxies API)
4. API → RDS (Prisma, pgvector for RAG embeddings)
5. API → ElastiCache (Socket.IO adapter, BullMQ, rate limiter)
6. API → Runner (HTTP, service discovery: `runner.devhub.local`)

### CloudFormation Stack Dependencies

```
devhub-vpc (VPC, subnets, SGs)
    ↓
devhub-data (RDS, ElastiCache)  ←── depends on VPC exports
    ↓
devhub-ecs (Cluster, ALB, services)  ←── depends on VPC + data exports
```

### Deployment Sequence

1. `deploy.sh --stack vpc` — network foundation
2. `deploy.sh --stack ecr` — container registries
3. `deploy.sh --stack build` — build & push Docker images
4. `deploy.sh --stack data` — database + cache (takes ~10 min)
5. `deploy.sh --stack ecs` — compute + load balancer
6. Run Prisma migrations via ECS Exec

### SOLID Principles in Infrastructure

- **SRP**: Each CloudFormation stack has one concern (network, data, compute)
- **OCP**: New services added without modifying existing stacks (new task def + service)
- **LSP**: Runner service substitutable — same container interface, different isolation
- **ISP**: Security groups grant only the ports each service needs
- **DIP**: Services depend on DNS names (service discovery), not IP addresses
