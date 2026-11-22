# DevHub+ AWS Architecture

## High-Level Design (HLD)

### System Context — EC2 Single-Server ($16/month)

```
                    ┌─────────────┐
                    │   Internet  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Caddy     │  HTTPS auto-TLS (Let's Encrypt)
                    │  container  │  devhub.3-109-36-90.sslip.io
                    └──────┬──────┘
                           │ reverse proxy
              ┌────────────┼────────────┐
              │            │            │
         /api/*      /socket.io/*      /*
              │            │            │
         ┌────▼────┐  ┌────▼────┐  ┌───▼────┐
         │   API   │  │   API   │  │  Web   │
         │  :4000  │  │  :4000  │  │ :8080  │
         └──┬──┬───┘  └─────────┘  │ nginx  │
            │  │                   └────────┘
     ┌──────┘  └──────┐
     │                │
┌────▼────┐    ┌──────▼──────┐
│Postgres │    │   Redis     │
│ pgvector│    │  container  │
│  :5432  │    │   :6379     │
└─────────┘    └─────────────┘
     │
┌────▼────┐
│ Runner  │  (sandbox network, no internet)
│  :2000  │
└─────────┘
```

### Why This Architecture

| Decision | Rationale |
|----------|-----------|
| Single EC2 vs ECS/Fargate | $16/month vs $93/month. t4g.small (2 vCPU, 2 GB) handles the full stack |
| Caddy vs ALB | Free auto-TLS, $0 vs $16/month. Already on the instance |
| Local Postgres vs RDS | $0 vs $12/month. pgvector works in Docker. Backups via EBS snapshots |
| Local Redis vs ElastiCache | $0 vs $6/month. 128 MB memory cap sufficient for cache + pub/sub |
| No NAT Gateway | $0 vs $32/month. EC2 has direct internet via EIP |
| docker-compose vs K8s | Simpler operations for a single server. Full isolation via Docker networks |

### Design Patterns Applied

- **Strategy Pattern**: AI provider interface (`AIProvider`) — swap Gemini for Bedrock without code changes
- **Observer Pattern**: `EventBus` decouples domain events from side effects
- **Dependency Injection**: Composition root (`container.ts`) wires all services
- **Transactional Outbox**: Reliable event delivery across service boundaries

## Low-Level Design (LLD)

### Resource Sizing (Memory Budget for 2 GB)

| Container | Memory Limit | Purpose |
|-----------|-------------|---------|
| Postgres + pgvector | 256 MB | Shared buffers 64 MB, 50 max connections |
| Redis | 192 MB | 128 MB maxmemory, AOF persistence |
| API (Node.js) | 384 MB | Express + Socket.IO + BullMQ + Prisma |
| Web (nginx) | 128 MB | Static SPA + gzip |
| Runner (Node.js) | 384 MB | Sandboxed code execution, read-only rootfs |
| Caddy | ~50 MB | Reverse proxy + auto-TLS |
| **Total** | **~1.4 GB** | Leaves ~400 MB for OS + buffers |

### Network Architecture

```
EC2 t4g.small (172.31.32.156, EIP 3.109.36.90)
├── Default VPC (172.31.0.0/16)
├── Security Group: HTTP 80, HTTPS 443 from 0.0.0.0/0
├── Docker bridge network (devhub-aws_default)
│   ├── postgres, redis, api, web — can talk to each other
│   └── caddy on host network proxies to 127.0.0.1:{4000,8080}
└── Docker internal network (devhub-aws_sandbox)
    ├── api — connected to both networks
    └── runner — isolated, no internet, API-only access
```

### Security (Defence in Depth)

1. **Network**: EC2 SG allows only 80/443. All containers bind to 127.0.0.1
2. **Runner isolation**: Internal Docker network (no internet), read-only rootfs, all caps dropped, no-new-privileges, PID/memory/CPU limits
3. **Caddy**: HSTS, X-Content-Type-Options, X-Frame-Options headers
4. **Secrets**: Generated on first deploy, never in git. .env.aws in .gitignore

### Cost Breakdown

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t4g.small (on-demand) | ~$15.00 |
| EBS gp3 15 GB | ~$1.20 |
| Elastic IP (attached) | $0.00 |
| Data transfer (first 100 GB) | ~$0.00 |
| **Total** | **~$16.20** |

All covered by FREE tier $100 credits (expires 2027-05-18).

### Deployment Flow

1. Push to GitHub → `git pull` on EC2 (manual or webhook)
2. `docker compose -f docker-compose.aws.yml build`
3. `docker compose -f docker-compose.aws.yml up -d`
4. API entrypoint runs `prisma migrate deploy` automatically
5. Caddy proxies HTTPS traffic to containers

### SOLID Principles in Infrastructure

- **SRP**: Each container has one responsibility (web serves static, API handles logic, runner executes code)
- **OCP**: New services added by extending docker-compose, no existing config changes
- **LSP**: Runner uses the same container interface as local dev
- **ISP**: Security group exposes only HTTP/HTTPS; containers expose only their ports
- **DIP**: Services depend on DNS names (Docker service discovery), not IPs
