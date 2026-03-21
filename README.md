# HumanProxy

Chat-based agent inbox for AI-human interaction. Self-hostable via Docker.

## Quick Start

```bash
# Clone & install
git clone https://github.com/your-org/humanproxy.git
cd humanproxy
npm install

# Copy environment config
cp .env.example .env

# Start everything with Docker
docker compose up

# Or develop locally:
docker compose up postgres minio -d    # Start infrastructure
npm run dev                             # Start backend + frontend
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Swagger Docs:** http://localhost:3001/api/docs
- **MinIO Console:** http://localhost:9001

## Tech Stack

- **Frontend:** Next.js 15, TailwindCSS v4, shadcn/ui
- **Backend:** NestJS, Fastify, Prisma, PostgreSQL
- **Storage:** MinIO (S3-compatible)
- **Monorepo:** Turborepo + npm workspaces

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
