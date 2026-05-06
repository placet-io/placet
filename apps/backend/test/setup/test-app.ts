import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';

/** Base URL of the running backend (Docker or local dev). */
export const BASE_URL = process.env.TEST_API_URL ?? 'http://localhost:3001';

interface E2EBridge {
  prisma: PrismaClient | null;
  state: Record<string, unknown>;
}

const bridge = (globalThis as unknown as { __e2e__: E2EBridge }).__e2e__;

let prisma: PrismaClient;

/**
 * Returns a Prisma client for direct DB access (e.g. seeding showcase data).
 * Uses the same DATABASE_URL as the running backend.
 */
export function getPrisma(): PrismaClient {
  if (bridge.prisma) {
    prisma = bridge.prisma;
    return prisma;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }
  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter });
  bridge.prisma = prisma;
  return prisma;
}

/**
 * Cleans up leftover test data from previous runs.
 * Call once in the first test file's beforeAll.
 */
export async function cleanupTestData() {
  const db = getPrisma();

  const testAgents = await db.agent.findMany({
    where: { name: 'E2E Test Bot' },
    select: { id: true },
  });
  const testAgentIds = testAgents.map((a) => a.id);

  if (testAgentIds.length > 0) {
    await db.messageStatusEvent.deleteMany({
      where: { channelId: { in: testAgentIds } },
    });
    await db.message.deleteMany({
      where: { channelId: { in: testAgentIds } },
    });
    await db.agent.deleteMany({ where: { id: { in: testAgentIds } } });
  }

  const testApiKeys = await db.apiKey.findMany({
    where: { label: 'E2E Test Key' },
    select: { id: true },
  });
  const testApiKeyIds = testApiKeys.map((k) => k.id);

  if (testApiKeyIds.length > 0) {
    await db.apiLog.deleteMany({
      where: { apiKeyId: { in: testApiKeyIds } },
    });
  }

  await db.apiKey.deleteMany({ where: { label: 'E2E Test Key' } });
}

/** Disconnects the Prisma client. Call in the last test file's afterAll. */
export async function cleanup() {
  if (bridge.prisma) {
    await bridge.prisma.$disconnect();
    bridge.prisma = null;
  }
}

/** Helper: extract access_token cookie from a supertest response. */
export function extractCookie(res: request.Response): string | undefined {
  const cookies = res.headers['set-cookie'];
  const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
  const match = /access_token=([^;]+)/.exec(cookieStr ?? '');
  return match?.[1];
}
