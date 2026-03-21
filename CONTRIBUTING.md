# Contributing to HumanProxy

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites

- **Node.js** >= 22
- **npm** >= 10
- **Docker** & **Docker Compose** (for local services)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/your-org/humanproxy.git
cd humanproxy

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start infrastructure (Postgres + MinIO)
docker compose up postgres minio -d

# Generate Prisma client
npm run prisma:generate --workspace=@humanproxy/backend

# Run database migrations
npm run prisma:migrate --workspace=@humanproxy/backend

# Start development servers
npm run dev
```

## Project Structure

```
humanproxy/
├── apps/
│   ├── backend/    # NestJS + Fastify API
│   └── frontend/   # Next.js 15 App
├── packages/
│   └── shared/     # Shared types & utilities
└── docker-compose.yml
```

## Workflow

1. **Fork** the repository
2. **Create a branch** from `main` (`git checkout -b feat/my-feature`)
3. **Make your changes** — follow existing code style
4. **Run checks** before committing:
   ```bash
   npm run lint
   npm run test
   npm run build
   ```
5. **Commit** with a descriptive message
6. **Open a Pull Request** against `main`

## Code Style

- We use **Prettier** for formatting and **ESLint** for linting
- Run `npm run format` to auto-format all files
- Single quotes, trailing commas, semicolons, 100 char line width

## Commit Messages

Use clear, descriptive commit messages. We recommend the [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat: add agent creation endpoint`
- `fix: resolve WebSocket reconnection issue`
- `docs: update API reference`
- `chore: upgrade dependencies`

## Reporting Issues

- Use **GitHub Issues** to report bugs or request features
- Include reproduction steps and environment details for bugs
- Check existing issues before creating a new one

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
