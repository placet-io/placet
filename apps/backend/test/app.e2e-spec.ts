import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as path from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

// Prisma returns BigInt for certain columns — make them JSON-serialisable.
(BigInt.prototype as bigint & { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

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
  const uploadedFileIds: string[] = [];

  // Test files for upload/download tests
  const TEST_FILES = [
    { name: 'jpeg_example.jpg', mime: 'image/jpeg' },
    { name: 'png_example.png', mime: 'image/png' },
    { name: 'pdf_example.pdf', mime: 'application/pdf' },
    { name: 'mov_example.mov', mime: 'video/quicktime' },
    {
      name: 'pptx_example.pptx',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    {
      name: 'docx_example.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    { name: 'csv_example.csv', mime: 'text/csv' },
    { name: 'ts_example.ts', mime: 'video/mp2t' },
    { name: 'html_example.html', mime: 'text/html' },
  ];

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
      new FastifyAdapter({ forceCloseConnections: true, maxParamLength: 500 }),
    );

    app.useGlobalPipes(new ZodValidationPipe());

    await (app as NestFastifyApplication).register(
      fastifyCookie as Parameters<NestFastifyApplication['register']>[0],
    );
    await (app as NestFastifyApplication).register(
      fastifyMultipart as Parameters<NestFastifyApplication['register']>[0],
      { limits: { fileSize: 100 * 1024 * 1024 } },
    );
    await app.init();
    await (app as NestFastifyApplication)
      .getHttpAdapter()
      .getInstance()
      .ready();

    httpServer = app.getHttpServer() as App;
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Clean up leftover test data from previous runs (respecting FK constraints)
    const testAgents = await prisma.agent.findMany({
      where: { name: 'E2E Test Bot' },
      select: { id: true },
    });
    const testAgentIds = testAgents.map((a) => a.id);

    if (testAgentIds.length > 0) {
      await prisma.message.deleteMany({
        where: { channelId: { in: testAgentIds } },
      });
      await prisma.agent.deleteMany({ where: { id: { in: testAgentIds } } });
    }

    const testApiKeys = await prisma.apiKey.findMany({
      where: { label: 'E2E Test Key' },
      select: { id: true },
    });
    const testApiKeyIds = testApiKeys.map((k) => k.id);

    if (testApiKeyIds.length > 0) {
      await prisma.apiLog.deleteMany({
        where: { apiKeyId: { in: testApiKeyIds } },
      });
    }

    await prisma.apiKey.deleteMany({ where: { label: 'E2E Test Key' } });
  }, 30_000);

  afterAll(async () => {
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

    describe('POST /api/files/upload', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).post('/api/files/upload').expect(401);
      });
    });

    describe('Upload test files via backend', () => {
      it.each(TEST_FILES)('should upload $name', async ({ name }) => {
        const filePath = path.join(__dirname, 'input-files', name);

        const res = await request(httpServer)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${accessToken}`)
          .field('channelId', agentId)
          .attach('file', filePath)
          .expect(201);

        const body = res.body as {
          id: string;
          filename: string;
          storageKey: string;
        };
        expect(body.id).toBeDefined();
        expect(body.filename).toBe(name);
        expect(body.storageKey).toMatch(/^uploads\//);

        uploadedFileIds.push(body.id);
      });
    });

    describe('GET /api/files (after upload)', () => {
      it('should list uploaded files', async () => {
        const res = await request(httpServer)
          .get('/api/files')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as {
          data: { id: string }[];
          nextCursor: string | null;
        };
        expect(body.data.length).toBeGreaterThanOrEqual(TEST_FILES.length);

        // All uploaded files should be present
        const ids = body.data.map((f) => f.id);
        for (const fileId of uploadedFileIds) {
          expect(ids).toContain(fileId);
        }
      });

      it('should filter by search term', async () => {
        const res = await request(httpServer)
          .get('/api/files?search=jpeg_example')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as { data: { filename: string }[] };
        expect(body.data.length).toBeGreaterThanOrEqual(1);
        expect(body.data[0].filename).toContain('jpeg_example');
      });

      it('should filter by MIME type prefix', async () => {
        const res = await request(httpServer)
          .get('/api/files?type=image')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as { data: { mimeType: string }[] };
        expect(body.data.length).toBeGreaterThanOrEqual(2); // jpg + png
        for (const file of body.data) {
          expect(file.mimeType).toMatch(/^image\//);
        }
      });
    });

    describe('GET /api/files/:id/download', () => {
      it('should stream file content with correct headers', async () => {
        // Download the first uploaded file (jpg)
        const res = await request(httpServer)
          .get(`/api/files/${uploadedFileIds[0]}/download`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .buffer(true);

        expect(res.headers['content-type']).toContain('image/jpeg');
        expect(res.headers['content-disposition']).toContain('jpeg_example');
        expect((res.body as Buffer).length).toBeGreaterThan(0);
      });

      it('should download PDF with correct content type', async () => {
        // Find the PDF attachment (3rd file uploaded)
        const pdfId = uploadedFileIds[2];
        const res = await request(httpServer)
          .get(`/api/files/${pdfId}/download`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .buffer(true);

        expect(res.headers['content-type']).toContain('application/pdf');
        expect((res.body as Buffer).length).toBeGreaterThan(0);
      });

      it('should return 404 for non-existent file', () => {
        return request(httpServer)
          .get('/api/files/nonexistent/download')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
      });
    });

    describe('POST /api/files/bulk-download', () => {
      it('should return a ZIP archive of selected files', async () => {
        const ids = uploadedFileIds.slice(0, 2); // first two files
        const res = await request(httpServer)
          .post('/api/files/bulk-download')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ ids })
          .expect(200)
          .buffer(true)
          .parse((res, cb) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
          });

        expect(res.headers['content-type']).toContain('application/zip');
        expect(res.headers['content-disposition']).toContain('files.zip');
        const body = res.body as Buffer;
        expect(body.length).toBeGreaterThan(0);
        // ZIP magic number: PK (0x50 0x4B)
        expect(body[0]).toBe(0x50);
        expect(body[1]).toBe(0x4b);
      });
    });

    describe('GET /api/files/:id/share + GET /api/share/:token', () => {
      it('should return 401 for share without auth', () => {
        return request(httpServer)
          .get(`/api/files/${uploadedFileIds[0]}/share`)
          .expect(401);
      });

      it('should generate a share link with full URL and expiry', async () => {
        const res = await request(httpServer)
          .get(`/api/files/${uploadedFileIds[0]}/share`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as { url: string; expiresIn: number };
        expect(body.url).toMatch(/\/api\/share\//);
        expect(body.expiresIn).toBe(3600);
      });

      it('should download file via share link without auth', async () => {
        // Generate share link
        const shareRes = await request(httpServer)
          .get(`/api/files/${uploadedFileIds[0]}/share`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const { url } = shareRes.body as { url: string };
        // Extract path from full URL (strip origin)
        const sharePath = new URL(url).pathname;

        // Download without any auth header
        const dlRes = await request(httpServer)
          .get(sharePath)
          .expect(200)
          .buffer(true);

        expect(dlRes.headers['content-type']).toContain('image/jpeg');
        expect(dlRes.headers['content-disposition']).toContain('jpeg_example');
        expect((dlRes.body as Buffer).length).toBeGreaterThan(0);
      });

      it('should return 404 for invalid share token', () => {
        return request(httpServer).get('/api/share/invalidtoken').expect(404);
      });

      it('should return 404 for non-existent file share', () => {
        return request(httpServer)
          .get(`/api/files/nonexistent/share`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
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

      it('should list files via agent API', async () => {
        const res = await request(httpServer)
          .get(`/api/v1/files?channel=${agentId}`)
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .expect(200);

        const body = res.body as unknown[];
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThanOrEqual(TEST_FILES.length);
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
  // Agent Status — /api/v1/status (API-key auth)
  // ──────────────────────────────────────────────
  describe('Agent Status (/api/v1/status)', () => {
    describe('POST /api/v1/status/ping', () => {
      it('should return 401 without API key', () => {
        return request(httpServer)
          .post('/api/v1/status/ping')
          .send({ agentId: 'fake', status: 'active' })
          .expect(401);
      });

      it('should set agent status to active', async () => {
        const res = await request(httpServer)
          .post('/api/v1/status/ping')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({ agentId: agentId, status: 'active' })
          .expect(201);

        const body = res.body as {
          id: string;
          status: string;
          statusMessage: string | null;
          statusSince: string | null;
        };
        expect(body.id).toBe(agentId);
        expect(body.status).toBe('active');
        expect(body.statusSince).toBeDefined();
      });

      it('should set agent status to busy with message', async () => {
        const res = await request(httpServer)
          .post('/api/v1/status/ping')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({
            agentId: agentId,
            status: 'busy',
            message: 'Processing batch job...',
          })
          .expect(201);

        const body = res.body as {
          status: string;
          statusMessage: string | null;
        };
        expect(body.status).toBe('busy');
        expect(body.statusMessage).toBe('Processing batch job...');
      });

      it('should set agent status to error with message', async () => {
        const res = await request(httpServer)
          .post('/api/v1/status/ping')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({
            agentId: agentId,
            status: 'error',
            message: 'Connection to DB failed',
          })
          .expect(201);

        const body = res.body as {
          status: string;
          statusMessage: string | null;
        };
        expect(body.status).toBe('error');
        expect(body.statusMessage).toBe('Connection to DB failed');
      });

      it('should set agent status back to active', async () => {
        const res = await request(httpServer)
          .post('/api/v1/status/ping')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({ agentId: agentId, status: 'active' })
          .expect(201);

        const body = res.body as { status: string };
        expect(body.status).toBe('active');
      });

      it('should reject invalid status value', () => {
        return request(httpServer)
          .post('/api/v1/status/ping')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({ agentId: agentId, status: 'invalid' })
          .expect(400);
      });

      it('should reject missing agentId', () => {
        return request(httpServer)
          .post('/api/v1/status/ping')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({ status: 'active' })
          .expect(400);
      });

      it('should reject non-owned agent', () => {
        return request(httpServer)
          .post('/api/v1/status/ping')
          .set('Authorization', `Bearer ${apiKeyRaw}`)
          .send({ agentId: 'nonexistent', status: 'active' })
          .expect(404);
      });
    });

    describe('GET /api/agents/:id/stats', () => {
      it('should return 401 without auth', () => {
        return request(httpServer)
          .get(`/api/agents/${agentId}/stats`)
          .expect(401);
      });

      it('should return agent statistics', async () => {
        const res = await request(httpServer)
          .get(`/api/agents/${agentId}/stats`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as {
          totalMessages: number;
          totalInbound: number;
          totalOutbound: number;
          successRequests: number;
          errorRequests: number;
          statusHistory: {
            status: string;
            message: string | null;
            createdAt: string;
          }[];
        };
        expect(body.totalMessages).toBeGreaterThanOrEqual(1);
        expect(body.totalInbound).toBeGreaterThanOrEqual(1);
        expect(typeof body.successRequests).toBe('number');
        expect(typeof body.errorRequests).toBe('number');
        expect(Array.isArray(body.statusHistory)).toBe(true);
        // We made 4 pings above (active, busy, error, active)
        expect(body.statusHistory.length).toBeGreaterThanOrEqual(4);
      });

      it('should return 404 for non-existent agent', () => {
        return request(httpServer)
          .get('/api/agents/nonexistent/stats')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
      });
    });

    describe('GET /api/agents/stats (global)', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/agents/stats').expect(401);
      });

      it('should return global statistics', async () => {
        const res = await request(httpServer)
          .get('/api/agents/stats')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const body = res.body as {
          totalAgents: number;
          activeAgents: number;
          totalMessages: number;
          successRequests: number;
          errorRequests: number;
        };
        expect(body.totalAgents).toBeGreaterThanOrEqual(1);
        expect(typeof body.activeAgents).toBe('number');
        expect(body.totalMessages).toBeGreaterThanOrEqual(1);
        expect(typeof body.successRequests).toBe('number');
        expect(typeof body.errorRequests).toBe('number');
      });
    });
  });

  // ──────────────────────────────────────────────
  // Chat showcase — diverse messages for frontend testing
  // Creates a rich variety so the UI can be reviewed visually.
  // ──────────────────────────────────────────────
  describe('Chat showcase (diverse messages for frontend)', () => {
    // ── Normal text messages ──────────────────────────────────
    it('should send a plain agent message', async () => {
      const res = await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: "Hey! I finished crawling the sitemap. Found **247 pages** across 12 sub-domains.\n\nHere's a quick breakdown:\n- Marketing: 89 pages\n- Docs: 104 pages\n- Blog: 54 pages\n\nNo broken links detected.",
        })
        .expect(201);

      expect((res.body as MessageResponse).senderType).toBe('agent');
    });

    it('should send a user reply', async () => {
      await request(httpServer)
        .post('/api/messages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          channelId: agentId,
          text: 'Awesome, can you check the docs section for outdated content?',
        })
        .expect(201);
    });

    // ── Status messages ───────────────────────────────────────
    it('should send an info status message', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'Scan started — checking docs section for pages last updated more than 6 months ago.',
          status: 'info',
        })
        .expect(201);
    });

    it('should send a warning status message', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'Found **18 pages** with outdated content (last edit > 6 months). 3 pages reference deprecated API endpoints.',
          status: 'warning',
        })
        .expect(201);
    });

    it('should send an error status message', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'Failed to reach `docs.example.com/api/v1` — DNS resolution timed out after 30 s.',
          status: 'error',
        })
        .expect(201);
    });

    it('should send a success status message', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'Recovery complete — the endpoint is reachable again. All 247 pages re-validated.',
          status: 'success',
        })
        .expect(201);
    });

    // ── Approval review ───────────────────────────────────────
    it('should send an approval review', async () => {
      const res = await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: "I'd like to auto-redirect 12 old blog URLs to their updated equivalents. This will set up 301 redirects in the CDN config.\n\nShould I proceed?",
          status: 'warning',
          review: {
            type: 'approval',
            payload: {
              options: [
                { id: 'approve', label: 'Yes, set up redirects' },
                { id: 'reject', label: 'No, skip for now', style: 'danger' },
              ],
              allowComment: true,
            },
          },
        })
        .expect(201);

      const body = res.body as MessageResponse;
      expect(body.review).toBeDefined();
    });

    // ── Selection review (single) ─────────────────────────────
    it('should send a single-selection review', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'Which deployment strategy should I use for the next release?',
          review: {
            type: 'selection',
            payload: {
              mode: 'single',
              items: [
                {
                  id: 'rolling',
                  label: 'Rolling update',
                  description: 'Gradually replace instances — zero downtime',
                },
                {
                  id: 'blue-green',
                  label: 'Blue/Green',
                  description: 'Switch traffic at once after full deployment',
                },
                {
                  id: 'canary',
                  label: 'Canary',
                  description: 'Route 5% of traffic first, then ramp up',
                },
              ],
            },
          },
        })
        .expect(201);
    });

    // ── Selection review (multi) ──────────────────────────────
    it('should send a multi-selection review', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'Select the notification channels for critical alerts:',
          review: {
            type: 'selection',
            payload: {
              mode: 'multi',
              items: [
                {
                  id: 'email',
                  label: 'Email',
                  description: 'admin@company.com',
                },
                {
                  id: 'slack',
                  label: 'Slack',
                  description: '#ops-alerts channel',
                },
                {
                  id: 'pagerduty',
                  label: 'PagerDuty',
                  description: 'Escalation policy: P1',
                },
                { id: 'sms', label: 'SMS', description: '+1 555-0123' },
              ],
            },
          },
        })
        .expect(201);
    });

    // ── Form review ───────────────────────────────────────────
    it('should send a form review', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'I need a few details to configure the new staging environment:',
          review: {
            type: 'form',
            payload: {
              fields: [
                {
                  name: 'envName',
                  type: 'text',
                  label: 'Environment name',
                  required: true,
                },
                {
                  name: 'region',
                  type: 'select',
                  label: 'AWS Region',
                  required: true,
                  options: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
                },
                {
                  name: 'instanceCount',
                  type: 'number',
                  label: 'Number of instances',
                  required: true,
                },
                {
                  name: 'notes',
                  type: 'textarea',
                  label: 'Additional notes',
                  required: false,
                },
              ],
            },
          },
        })
        .expect(201);
    });

    // ── Text-input review ─────────────────────────────────────
    it('should send a text-input review', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'The release notes draft is ready. Please review and provide your edits:',
          review: {
            type: 'text-input',
            payload: {
              prefill:
                '## v2.4.0 Release Notes\n\n### New Features\n- Sitemap crawler with broken-link detection\n- Auto-redirect setup for legacy URLs\n\n### Bug Fixes\n- Fixed timeout on large doc sites\n\n### Breaking Changes\n- None',
              markdown: true,
            },
          },
        })
        .expect(201);
    });

    // ── Freeform review ───────────────────────────────────────
    it('should send a freeform review', async () => {
      await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'Please provide the CDN purge configuration as JSON:',
          review: {
            type: 'freeform',
            payload: {
              schema: {
                type: 'object',
                properties: {
                  paths: { type: 'array', items: { type: 'string' } },
                  softPurge: { type: 'boolean' },
                  notify: { type: 'string' },
                },
              },
            },
          },
        })
        .expect(201);
    });

    // ── Already-completed review ──────────────────────────────
    let completedReviewMsgId: string;

    it('should send a review and immediately respond to it', async () => {
      const createRes = await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: 'Shall I enable gzip compression on the CDN?',
          review: {
            type: 'approval',
            payload: {
              options: [
                { id: 'yes', label: 'Enable' },
                { id: 'no', label: 'Skip' },
              ],
            },
          },
        })
        .expect(201);

      completedReviewMsgId = (createRes.body as MessageResponse).id;

      await request(httpServer)
        .post(`/api/messages/${completedReviewMsgId}/respond`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ response: { selectedOption: 'yes' } })
        .expect(201);
    });

    // ── Multi-file message (via Prisma) ───────────────────────
    it('should create a message with multiple attachments', async () => {
      // Look up the already-uploaded attachments to reuse their storageKeys
      const existing = await prisma.attachment.findMany({
        where: { channelId: agentId },
        orderBy: { createdAt: 'asc' },
        take: 4,
      });
      expect(existing.length).toBeGreaterThanOrEqual(4);

      // Create a single message with multiple attachments
      const msg = await prisma.message.create({
        data: {
          channelId: agentId,
          senderType: 'agent',
          senderId: agentId,
          text: 'Here are the project deliverables — presentation, document, data export, and a screenshot:',
          attachments: {
            create: existing.map((att) => ({
              agent: { connect: { id: agentId } },
              pluginType: att.pluginType,
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              storageKey: att.storageKey,
            })),
          },
        },
        include: { attachments: true },
      });

      expect(msg.attachments.length).toBe(4);
    });

    // ── Single-image message (already exists from upload, but add an explicit one with text) ──
    it('should create a message with a single image and text', async () => {
      const imageAtt = await prisma.attachment.findFirst({
        where: {
          channelId: agentId,
          mimeType: { startsWith: 'image/' },
        },
      });
      expect(imageAtt).toBeDefined();

      const msg = await prisma.message.create({
        data: {
          channelId: agentId,
          senderType: 'agent',
          senderId: agentId,
          text: 'Here is the updated architecture diagram:',
          attachments: {
            create: {
              agent: { connect: { id: agentId } },
              pluginType: imageAtt!.pluginType,
              filename: imageAtt!.filename,
              mimeType: imageAtt!.mimeType,
              size: imageAtt!.size,
              storageKey: imageAtt!.storageKey,
            },
          },
        },
        include: { attachments: true },
      });

      expect(msg.attachments.length).toBe(1);
    });

    // ── Single-video message ──────────────────────────────────
    it('should create a message with a single video', async () => {
      const videoAtt = await prisma.attachment.findFirst({
        where: {
          channelId: agentId,
          mimeType: { startsWith: 'video/' },
        },
      });
      expect(videoAtt).toBeDefined();

      const msg = await prisma.message.create({
        data: {
          channelId: agentId,
          senderType: 'agent',
          senderId: agentId,
          text: 'Screen recording of the bug reproduction:',
          attachments: {
            create: {
              agent: { connect: { id: agentId } },
              pluginType: videoAtt!.pluginType,
              filename: videoAtt!.filename,
              mimeType: videoAtt!.mimeType,
              size: videoAtt!.size,
              storageKey: videoAtt!.storageKey,
            },
          },
        },
        include: { attachments: true },
      });

      expect(msg.attachments.length).toBe(1);
    });

    // ── PDF with approval review (3 buttons) ──────────────────
    it('should create a message with a PDF and 3 response buttons', async () => {
      const pdfAtt = await prisma.attachment.findFirst({
        where: {
          channelId: agentId,
          mimeType: 'application/pdf',
        },
      });
      expect(pdfAtt).toBeDefined();

      const msg = await prisma.message.create({
        data: {
          channelId: agentId,
          senderType: 'agent',
          senderId: agentId,
          text: 'Here is the generated invoice for Q1. Please review and choose an action:',
          status: 'warning',
          review: {
            type: 'approval',
            status: 'pending',
            response: null,
            callback: null,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            completedAt: null,
            payload: {
              options: [
                { id: 'approve', label: 'Approve & Send' },
                { id: 'revise', label: 'Request Revision' },
                { id: 'reject', label: 'Reject', style: 'danger' },
              ],
              allowComment: true,
            },
          },
          attachments: {
            create: {
              agent: { connect: { id: agentId } },
              pluginType: '@uax/file',
              filename: pdfAtt!.filename,
              mimeType: pdfAtt!.mimeType,
              size: pdfAtt!.size,
              storageKey: pdfAtt!.storageKey,
            },
          },
        },
        include: { attachments: true },
      });

      expect(msg.attachments.length).toBe(1);
      expect(msg.review).toBeDefined();
    });

    // ── Markdown message ──────────────────────────────────────
    it('should create a message with rich markdown content', async () => {
      const res = await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${apiKeyRaw}`)
        .send({
          channelId: agentId,
          text: [
            '# Deployment Summary',
            '',
            'The deployment **completed successfully** with the following results:',
            '',
            '## Changes',
            '- Added new `UserService` module',
            '- Fixed [issue #42](https://example.com/issues/42)',
            '- Updated dependencies',
            '',
            '## Metrics',
            '| Metric | Before | After |',
            '|--------|--------|-------|',
            '| Build time | 45s | 32s |',
            '| Bundle size | 1.2MB | 980KB |',
            '| Test coverage | 78% | 85% |',
            '',
            '## Code Example',
            '```typescript',
            'const result = await deploy({',
            '  environment: "production",',
            '  dryRun: false,',
            '});',
            '```',
            '',
            '> **Note:** All services are healthy. Next deploy window: Monday 9am.',
          ].join('\n'),
          status: 'success',
        })
        .expect(201);

      const body = res.body as MessageResponse;
      expect(body.text).toContain('# Deployment Summary');
      expect(body.text).toContain('```typescript');
      expect(body.text).toContain('| Metric');
      expect(body.status).toBe('success');
    });

    // ── HTML attachment message ────────────────────────────────
    it('should create a message with an HTML file attachment', async () => {
      const htmlAtt = await prisma.attachment.findFirst({
        where: {
          channelId: agentId,
          mimeType: 'text/html',
        },
      });
      expect(htmlAtt).toBeDefined();

      const msg = await prisma.message.create({
        data: {
          channelId: agentId,
          senderType: 'agent',
          senderId: agentId,
          text: 'Here is the generated monthly report. Open it to view the formatted HTML preview:',
          attachments: {
            create: {
              agent: { connect: { id: agentId } },
              pluginType: '@uax/file',
              filename: htmlAtt!.filename,
              mimeType: htmlAtt!.mimeType,
              size: htmlAtt!.size,
              storageKey: htmlAtt!.storageKey,
            },
          },
        },
        include: { attachments: true },
      });

      expect(msg.attachments.length).toBe(1);
      expect(msg.attachments[0].mimeType).toBe('text/html');
    });

    // ── Image + multiple approval buttons + text review input ─
    it('should create a message with an image, multiple review buttons and a text input', async () => {
      const imageAtt = await prisma.attachment.findFirst({
        where: {
          channelId: agentId,
          mimeType: { startsWith: 'image/' },
        },
      });
      expect(imageAtt).toBeDefined();

      const msg = await prisma.message.create({
        data: {
          channelId: agentId,
          senderType: 'agent',
          senderId: agentId,
          text: 'Here is the latest design mockup. Please review the image and choose an action — you can also leave a written comment:',
          status: 'info',
          review: {
            type: 'approval',
            status: 'pending',
            response: null,
            callback: null,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            completedAt: null,
            payload: {
              options: [
                { id: 'approve', label: 'Looks good, approve' },
                { id: 'revise', label: 'Needs revision' },
                { id: 'reject', label: 'Reject design', style: 'danger' },
              ],
              allowComment: true,
            },
          },
          attachments: {
            create: {
              agent: { connect: { id: agentId } },
              pluginType: '@uax/file',
              filename: imageAtt!.filename,
              mimeType: imageAtt!.mimeType,
              size: imageAtt!.size,
              storageKey: imageAtt!.storageKey,
            },
          },
        },
        include: { attachments: true },
      });

      expect(msg.attachments.length).toBe(1);
      expect(msg.attachments[0].mimeType).toMatch(/^image\//);
      expect(msg.review).toBeDefined();
      const payload = msg.review as {
        type: string;
        payload: { options: { id: string }[]; allowComment: boolean };
      };
      expect(payload.type).toBe('approval');
      expect(payload.payload.options).toHaveLength(3);
      expect(payload.payload.allowComment).toBe(true);
    });

    // ── User follow-up ────────────────────────────────────────
    it('should send final user messages', async () => {
      await request(httpServer)
        .post('/api/messages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          channelId: agentId,
          text: 'Thanks for all the files! The diagram looks good.',
        })
        .expect(201);

      await request(httpServer)
        .post('/api/messages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          channelId: agentId,
          text: 'Can you also export the data as Excel next time?',
        })
        .expect(201);
    });

    it('should have a rich message history now', async () => {
      const res = await request(httpServer)
        .get(`/api/messages?channel=${agentId}&limit=50`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as { data: MessageResponse[] };
      // Verify we have a healthy mix of messages
      expect(body.data.length).toBeGreaterThanOrEqual(15);

      // Check reviews exist
      const withReviews = body.data.filter((m) => m.review != null);
      expect(withReviews.length).toBeGreaterThanOrEqual(5);

      // Check statuses exist
      const withStatus = body.data.filter((m) => m.status != null);
      expect(withStatus.length).toBeGreaterThanOrEqual(4);
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
});
