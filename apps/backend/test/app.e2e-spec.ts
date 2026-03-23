import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import type { App } from 'supertest/types';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * E2E tests for the HumanProxy backend API.
 * Uses the real local PostgreSQL database.
 *
 * Requirements:
 *   - PostgreSQL running on localhost:5432
 *   - DATABASE_URL set (e.g. via .env)
 *   - Schema pushed (prisma db push)
 *
 * The initial owner user is seeded automatically by AuthService.onModuleInit.
 */

// Test credentials (must match .env INITIAL_USER_EMAIL / INITIAL_USER_PASSWORD)
const TEST_EMAIL = process.env.INITIAL_USER_EMAIL ?? 'admin@humanproxy.local';
const TEST_PASSWORD = process.env.INITIAL_USER_PASSWORD ?? 'changeme';

/**
 * Set to false to keep all test data after the run (useful for inspecting
 * logs, messages, agents etc. in the database or frontend).
 */
const CLEANUP_AFTER_TEST = false;

interface ResponseBody {
  status?: string;
  timestamp?: string;
  message?: string;
  data?: unknown[];
  theme?: string;
  key?: string;
  id?: string;
  label?: string;
  deleted?: boolean;
  user?: { id: string; email: string; mustChangePassword?: boolean };
  accessToken?: string;
}

interface MessageResponse {
  id: string;
  channelId: string;
  senderType: string;
  text?: string;
  status?: string;
  review?: unknown;
}

describe('HumanProxy API (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;
  let prisma: PrismaService;

  // Shared state built up across ordered tests
  let accessToken: string;
  let userId: string;
  let apiKeyId: string;
  let apiKeyRaw: string;
  let agentId: string;

  // Helper: extract access_token cookie from response
  function extractCookie(res: request.Response): string | undefined {
    const cookies = res.headers['set-cookie'];
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    const match = /access_token=([^;]+)/.exec(cookieStr ?? '');
    return match?.[1];
  }

  // ── Setup ───────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    app.useGlobalPipes(new ZodValidationPipe());

    await (app as NestFastifyApplication).register(
      fastifyCookie as Parameters<NestFastifyApplication['register']>[0],
    );
    await app.init();
    await (app as NestFastifyApplication)
      .getHttpAdapter()
      .getInstance()
      .ready();

    httpServer = app.getHttpServer() as App;
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  }, 30_000);

  afterAll(async () => {
    if (CLEANUP_AFTER_TEST) {
      // Clean up test data in correct order (respecting FK constraints)
      if (agentId) {
        await prisma.message.deleteMany({ where: { channelId: agentId } });
        await prisma.apiLog.deleteMany({ where: { agentId } });
        await prisma.agent.deleteMany({ where: { id: agentId } });
      }
      if (apiKeyId) {
        await prisma.apiKey.deleteMany({ where: { id: apiKeyId } });
      }
    }
    await app.close();
  });

  // ──────────────────────────────────────────────
  // Health
  // ──────────────────────────────────────────────
  describe('GET /health', () => {
    it('should return status ok', () => {
      return request(httpServer)
        .get('/health')
        .expect(200)
        .expect((res) => {
          const body = res.body as ResponseBody;
          expect(body.status).toBe('ok');
          expect(body.timestamp).toBeDefined();
        });
    });
  });

  // ──────────────────────────────────────────────
  // Auth
  // ──────────────────────────────────────────────
  describe('Auth', () => {
    describe('POST /api/auth/login', () => {
      it('should return 401 on invalid credentials', () => {
        return request(httpServer)
          .post('/api/auth/login')
          .send({ email: 'bad@example.com', password: 'wrong' })
          .expect(401);
      });

      it('should return 400 when email is missing', () => {
        return request(httpServer)
          .post('/api/auth/login')
          .send({ password: 'pw' })
          .expect(400);
      });

      it('should return 400 when password is missing', () => {
        return request(httpServer)
          .post('/api/auth/login')
          .send({ email: 'a@b.com' })
          .expect(400);
      });

      it('should login with valid credentials and return user + cookie', async () => {
        const res = await request(httpServer)
          .post('/api/auth/login')
          .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
          .expect(200);

        const body = res.body as ResponseBody;
        expect(body.user).toBeDefined();
        expect(body.user!.email).toBe(TEST_EMAIL);

        // accessToken is only set via cookie, not in the response body
        const cookie = extractCookie(res);
        expect(cookie).toBeDefined();

        // Store for subsequent tests
        accessToken = cookie!;
        userId = body.user!.id;
      });

      it('should set access_token cookie on login', async () => {
        const res = await request(httpServer)
          .post('/api/auth/login')
          .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
          .expect(200);

        const cookie = extractCookie(res);
        expect(cookie).toBeDefined();
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).post('/api/auth/refresh').expect(401);
      });

      it('should return 200 and user with valid JWT', async () => {
        const res = await request(httpServer)
          .post('/api/auth/refresh')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as ResponseBody;
        expect(body.user).toBeDefined();
        expect(body.user!.id).toBe(userId);
      });

      it('should set a new access_token cookie', async () => {
        const res = await request(httpServer)
          .post('/api/auth/refresh')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const cookie = extractCookie(res);
        expect(cookie).toBeDefined();
      });

      it('should return 401 with an expired/invalid JWT', () => {
        return request(httpServer)
          .post('/api/auth/refresh')
          .set('Authorization', 'Bearer invalid.jwt.token')
          .expect(401);
      });
    });

    describe('GET /api/auth/me', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/auth/me').expect(401);
      });

      it('should return current user with valid JWT', async () => {
        const res = await request(httpServer)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as {
          user: {
            id: string;
            email: string;
            displayName: string;
            role: string;
            mustChangePassword: boolean;
          };
        };
        expect(body.user.id).toBe(userId);
        expect(body.user.email).toBe(TEST_EMAIL);
        expect(body.user.role).toBe('owner');
      });
    });

    describe('POST /api/auth/logout', () => {
      it('should return 200 and message', () => {
        return request(httpServer)
          .post('/api/auth/logout')
          .expect(200)
          .expect((res) => {
            expect((res.body as ResponseBody).message).toBe('Logged out');
          });
      });

      it('should clear the access_token cookie', async () => {
        const res = await request(httpServer)
          .post('/api/auth/logout')
          .expect(200);

        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
        expect(cookieStr).toContain('access_token=');
      });
    });

    describe('POST /api/auth/change-password', () => {
      it('should return 401 without auth', () => {
        return request(httpServer)
          .post('/api/auth/change-password')
          .send({ currentPassword: 'old', newPassword: 'newpassword' })
          .expect(401);
      });

      it('should return 400 with missing fields', () => {
        return request(httpServer)
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({})
          .expect(400);
      });

      it('should return 400 with short new password', () => {
        return request(httpServer)
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ currentPassword: 'oldpass', newPassword: 'ab' })
          .expect(400);
      });
    });
  });

  // ──────────────────────────────────────────────
  // Users (JWT protected, owner-only)
  // ──────────────────────────────────────────────
  describe('Users', () => {
    describe('GET /api/users', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/users').expect(401);
      });

      it('should return users list with valid JWT', async () => {
        const res = await request(httpServer)
          .get('/api/users')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        const users = res.body as { id: string; email: string }[];
        expect(users.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('POST /api/users', () => {
      it('should return 401 without auth', () => {
        return request(httpServer)
          .post('/api/users')
          .send({
            email: 'new@test.com',
            displayName: 'New',
            password: 'longpassword',
          })
          .expect(401);
      });

      it('should reject invalid email', () => {
        return request(httpServer)
          .post('/api/users')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            email: 'not-an-email',
            displayName: 'A',
            password: 'longpassword',
          })
          .expect(400);
      });

      it('should reject short password', () => {
        return request(httpServer)
          .post('/api/users')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ email: 'ok@test.com', displayName: 'A', password: 'short' })
          .expect(400);
      });
    });
  });

  // ──────────────────────────────────────────────
  // Agents (JWT protected)
  // ──────────────────────────────────────────────
  describe('Agents', () => {
    describe('GET /api/agents', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/agents').expect(401);
      });

      it('should return agents list with valid JWT', async () => {
        const res = await request(httpServer)
          .get('/api/agents')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
      });
    });

    describe('POST /api/agents', () => {
      it('should create an agent', async () => {
        const res = await request(httpServer)
          .post('/api/agents')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'E2E Test Bot' })
          .expect(201);

        const body = res.body as { id: string; name: string };
        expect(body.name).toBe('E2E Test Bot');
        expect(body.id).toBeDefined();

        // Store for subsequent tests
        agentId = body.id;
      });

      it('should reject empty name', () => {
        return request(httpServer)
          .post('/api/agents')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '' })
          .expect(400);
      });

      it('should reject invalid avatarUrl', () => {
        return request(httpServer)
          .post('/api/agents')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Bot', avatarUrl: 'not-a-url' })
          .expect(400);
      });
    });
  });

  // ──────────────────────────────────────────────
  // API Keys (JWT protected)
  // ──────────────────────────────────────────────
  describe('API Keys', () => {
    describe('GET /api/api-keys', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/api-keys').expect(401);
      });

      it('should return API keys list with valid JWT', async () => {
        const res = await request(httpServer)
          .get('/api/api-keys')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
      });
    });

    describe('POST /api/api-keys', () => {
      it('should create an API key and return the full key once', async () => {
        const res = await request(httpServer)
          .post('/api/api-keys')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ label: 'E2E Test Key' })
          .expect(201);

        const body = res.body as ResponseBody;
        expect(body.key).toMatch(/^hp_/);
        expect(body.label).toBe('E2E Test Key');
        expect(body.id).toBeDefined();

        // Store for subsequent tests
        apiKeyId = body.id!;
        apiKeyRaw = body.key!;
      });
    });

    describe('POST /api/api-keys/:id/rotate', () => {
      it('should return 401 without auth', () => {
        return request(httpServer)
          .post('/api/api-keys/nonexistent/rotate')
          .expect(401);
      });

      it('should return 404 for non-existent key', () => {
        return request(httpServer)
          .post('/api/api-keys/nonexistent/rotate')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
      });

      it('should rotate an API key and return new key', async () => {
        const res = await request(httpServer)
          .post(`/api/api-keys/${apiKeyId}/rotate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as ResponseBody;
        expect(body.key).toMatch(/^hp_/);
        expect(body.id).toBe(apiKeyId);

        // Update stored key (old one is now invalid)
        apiKeyRaw = body.key!;
      });
    });
  });

  // ──────────────────────────────────────────────
  // Messages (JWT protected user endpoints)
  // ──────────────────────────────────────────────
  describe('Messages', () => {
    describe('GET /api/messages', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/messages?channel=a1').expect(401);
      });

      it('should return messages for owned agent', async () => {
        const res = await request(httpServer)
          .get(`/api/messages?channel=${agentId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect((res.body as ResponseBody).data).toBeDefined();
      });
    });

    describe('GET /api/messages/reviews', () => {
      it('should return pending reviews', async () => {
        const res = await request(httpServer)
          .get('/api/messages/reviews')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
      });
    });
  });

  // ──────────────────────────────────────────────
  // Logs (JWT protected)
  // ──────────────────────────────────────────────
  describe('Logs', () => {
    describe('GET /api/logs', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/logs').expect(401);
      });

      it('should return logs with valid JWT', async () => {
        const res = await request(httpServer)
          .get('/api/logs')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect((res.body as ResponseBody).data).toBeDefined();
      });
    });
  });

  // ──────────────────────────────────────────────
  // Preferences (JWT protected)
  // ──────────────────────────────────────────────
  describe('Preferences', () => {
    describe('GET /api/preferences', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/preferences').expect(401);
      });

      it('should return user preferences', () => {
        return request(httpServer)
          .get('/api/preferences')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      });
    });

    describe('PATCH /api/preferences', () => {
      it('should update preferences', async () => {
        const res = await request(httpServer)
          .patch('/api/preferences')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ theme: 'dark' })
          .expect(200);

        expect((res.body as ResponseBody).theme).toBe('dark');
      });
    });
  });

  // ──────────────────────────────────────────────
  // Files (JWT protected)
  // ──────────────────────────────────────────────
  describe('Files', () => {
    describe('GET /api/files', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/files').expect(401);
      });
    });
  });

  // ──────────────────────────────────────────────
  // Agent API — /api/v1/ (API-key auth)
  // These routes produce API logs in the database.
  // ──────────────────────────────────────────────
  describe('Agent API (/api/v1/)', () => {
    describe('without API key', () => {
      it('POST /api/v1/messages should return 401', () => {
        return request(httpServer)
          .post('/api/v1/messages')
          .send({ channelId: 'fake', text: 'hello' })
          .expect(401);
      });

      it('GET /api/v1/messages should return 401', () => {
        return request(httpServer).get('/api/v1/messages').expect(401);
      });

      it('GET /api/v1/files should return 401', () => {
        return request(httpServer).get('/api/v1/files').expect(401);
      });

      it('GET /api/v1/reviews/pending should return 401', () => {
        return request(httpServer).get('/api/v1/reviews/pending').expect(401);
      });

      it('GET /api/v1/reviews/m1 should return 401', () => {
        return request(httpServer).get('/api/v1/reviews/m1').expect(401);
      });

      it('GET /api/v1/reviews/m1/wait should return 401', () => {
        return request(httpServer).get('/api/v1/reviews/m1/wait').expect(401);
      });
    });

    describe('with valid API key', () => {
      it('should send a message via agent API', async () => {
        const res = await request(httpServer)
          .post('/api/v1/messages')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({ channelId: agentId, text: 'Hello from E2E agent test' })
          .expect(201);

        const body = res.body as MessageResponse;
        expect(body.channelId).toBe(agentId);
        expect(body.senderType).toBe('agent');
        expect(body.text).toBe('Hello from E2E agent test');
      });

      it('should list messages via agent API', async () => {
        const res = await request(httpServer)
          .get(`/api/v1/messages?channel=${agentId}`)
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .expect(200);

        const body = res.body as { data: MessageResponse[] };
        expect(body.data).toBeDefined();
        expect(body.data.length).toBeGreaterThanOrEqual(1);
      });

      it('should list files via agent API (empty)', async () => {
        const res = await request(httpServer)
          .get(`/api/v1/files?channel=${agentId}`)
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should list pending reviews via agent API', async () => {
        const res = await request(httpServer)
          .get(`/api/v1/reviews/pending?channel=${agentId}`)
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should return 404 for non-existent review', () => {
        return request(httpServer)
          .get(`/api/v1/reviews/nonexistent?channel=${agentId}`)
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .expect(404);
      });

      it('should send a message with status', async () => {
        const res = await request(httpServer)
          .post('/api/v1/messages')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({
            channelId: agentId,
            text: 'Deployment finished successfully',
            status: 'success',
          })
          .expect(201);

        const body = res.body as MessageResponse;
        expect(body.status).toBe('success');
      });

      it('should reject message to non-owned agent', () => {
        return request(httpServer)
          .post('/api/v1/messages')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({ channelId: 'nonexistent-agent', text: 'test' })
          .expect(403);
      });
    });
  });

  // ──────────────────────────────────────────────
  // Verify API logs were created by agent API calls
  // ──────────────────────────────────────────────
  describe('API Logs verification', () => {
    it('should have logged agent API calls', async () => {
      // Give the async log writes a moment to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const res = await request(httpServer)
        .get('/api/logs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as {
        data: { path: string; method: string; statusCode: number }[];
      };
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      // Verify at least one /api/v1/ log exists
      const v1Logs = body.data.filter((log) => log.path.startsWith('/api/v1/'));
      expect(v1Logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ──────────────────────────────────────────────
  // Cleanup: Delete API key and agent via API
  // ──────────────────────────────────────────────
  describe('Cleanup', () => {
    it('should delete the test API key', () => {
      return request(httpServer)
        .delete(`/api/api-keys/${apiKeyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect((res.body as ResponseBody).deleted).toBe(true);
        });
    });

    it('should delete the test agent', () => {
      return request(httpServer)
        .delete(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
