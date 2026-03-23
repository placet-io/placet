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
import { AuthService } from './../src/modules/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

/**
 * E2E tests for the HumanProxy backend API.
 * Uses mocked PrismaService to avoid requiring a real database.
 */

// Shared mock for PrismaService
const mockPrisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  agent: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  attachment: { findMany: jest.fn() },
  apiLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  apiKey: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

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
}

describe('HumanProxy API (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;
  let jwtService: JwtService;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // Prevent AuthService.onModuleInit from running seed logic
    const authService = app.get(AuthService);
    jest.spyOn(authService, 'onModuleInit').mockResolvedValue(undefined);

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
    jwtService = moduleFixture.get<JwtService>(JwtService);
    jwtToken = jwtService.sign({
      sub: 'test-user-id',
      email: 'admin@humanproxy.local',
      role: 'owner',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
      it('should return 401 on invalid credentials', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

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
    });

    describe('POST /api/auth/refresh', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).post('/api/auth/refresh').expect(401);
      });

      it('should return 200 and user with valid JWT', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          displayName: 'Admin',
          role: 'owner',
        });

        const res = await request(httpServer)
          .post('/api/auth/refresh')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200);

        const body = res.body as { user: { id: string; email: string } };
        expect(body.user).toBeDefined();
        expect(body.user.id).toBe('test-user-id');
        expect(body.user.email).toBe('admin@humanproxy.local');
      });

      it('should set a new access_token cookie', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          displayName: 'Admin',
          role: 'owner',
        });

        const res = await request(httpServer)
          .post('/api/auth/refresh')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200);

        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
        expect(cookieStr).toContain('access_token=');
        expect(cookieStr).toContain('HttpOnly');
      });

      it('should return 401 with an expired/invalid JWT', () => {
        return request(httpServer)
          .post('/api/auth/refresh')
          .set('Authorization', 'Bearer invalid.jwt.token')
          .expect(401);
      });

      it('should return 401 if user was deleted since token was issued', async () => {
        // First call by JwtStrategy.validate → finds user
        // We need findUnique to return user for JwtStrategy, then null for refresh
        mockPrisma.user.findUnique
          .mockResolvedValueOnce({
            id: 'test-user-id',
            email: 'admin@humanproxy.local',
            role: 'owner',
          })
          .mockResolvedValueOnce(null); // user deleted before refresh

        return request(httpServer)
          .post('/api/auth/refresh')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(401);
      });
    });

    describe('GET /api/auth/me', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).get('/api/auth/me').expect(401);
      });

      it('should return current user with valid JWT including mustChangePassword', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          displayName: 'Admin',
          role: 'owner',
          mustChangePassword: true,
        });

        const res = await request(httpServer)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${jwtToken}`)
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
        expect(body.user.id).toBe('test-user-id');
        expect(body.user.email).toBe('admin@humanproxy.local');
        expect(body.user.displayName).toBe('Admin');
        expect(body.user.role).toBe('owner');
        expect(body.user.mustChangePassword).toBe(true);
      });

      it('should return 401 if user was deleted', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

        return request(httpServer)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(401);
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

      it('should return 400 with missing fields', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          role: 'owner',
        });

        return request(httpServer)
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({})
          .expect(400);
      });

      it('should return 400 with short new password', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          role: 'owner',
        });

        return request(httpServer)
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${jwtToken}`)
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
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          role: 'owner',
        });
        mockPrisma.user.findMany.mockResolvedValue([
          {
            id: 'u1',
            email: 'a@b.com',
            displayName: 'Admin',
            role: 'owner',
            createdAt: new Date().toISOString(),
          },
        ]);

        return request(httpServer)
          .get('/api/users')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200)
          .expect((res) => {
            expect(Array.isArray(res.body as unknown[])).toBe(true);
          });
      });
    });

    describe('POST /api/users', () => {
      it('should return 401 without auth', () => {
        return request(httpServer)
          .post('/api/users')
          .send({ email: 'new@test.com', displayName: 'New', password: 'pw' })
          .expect(401);
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
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          role: 'owner',
        });
        mockPrisma.agent.findMany.mockResolvedValue([
          { id: 'a1', name: 'Bot', webhookUrl: null },
        ]);

        return request(httpServer)
          .get('/api/agents')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200)
          .expect((res) => {
            expect(Array.isArray(res.body as unknown[])).toBe(true);
          });
      });
    });

    describe('POST /api/agents', () => {
      it('should create an agent (no API key in response)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          role: 'owner',
        });
        mockPrisma.agent.create.mockResolvedValue({
          id: 'a1',
          name: 'TestBot',
          webhookUrl: null,
        });

        return request(httpServer)
          .post('/api/agents')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({ name: 'TestBot' })
          .expect(201)
          .expect((res) => {
            const body = res.body as { id: string; name: string };
            expect(body.id).toBe('a1');
            expect(body.name).toBe('TestBot');
          });
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
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.apiKey.findMany.mockResolvedValue([
          { id: 'k1', label: 'Default', keyPrefix: 'hp_abc1234' },
        ]);

        return request(httpServer)
          .get('/api/api-keys')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200)
          .expect((res) => {
            expect(Array.isArray(res.body as unknown[])).toBe(true);
          });
      });
    });

    describe('POST /api/api-keys', () => {
      it('should create an API key and return the full key once', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.apiKey.create.mockImplementation(
          ({ data }: { data: Record<string, unknown> }) => {
            return Promise.resolve({
              id: 'k1',
              userId: 'test-user-id',
              label: data.label,
              keyPrefix: data.keyPrefix,
              lastUsedAt: null,
              createdAt: new Date().toISOString(),
            });
          },
        );

        return request(httpServer)
          .post('/api/api-keys')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({ label: 'CI Key' })
          .expect(201)
          .expect((res) => {
            const body = res.body as ResponseBody;
            expect(body.key).toMatch(/^hp_/);
            expect(body.label).toBe('CI Key');
          });
      });
    });

    describe('DELETE /api/api-keys/:id', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).delete('/api/api-keys/k1').expect(401);
      });

      it('should delete an API key', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.apiKey.findFirst.mockResolvedValue({
          id: 'k1',
          userId: 'test-user-id',
        });
        mockPrisma.apiKey.delete.mockResolvedValue({});

        return request(httpServer)
          .delete('/api/api-keys/k1')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200)
          .expect((res) => {
            expect((res.body as ResponseBody).deleted).toBe(true);
          });
      });
    });

    describe('POST /api/api-keys/:id/rotate', () => {
      it('should return 401 without auth', () => {
        return request(httpServer).post('/api/api-keys/k1/rotate').expect(401);
      });

      it('should rotate an API key and return new key', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.apiKey.findFirst.mockResolvedValue({
          id: 'k1',
          userId: 'test-user-id',
        });
        mockPrisma.apiKey.update.mockImplementation(
          ({ data }: { data: Record<string, unknown> }) => {
            return Promise.resolve({
              id: 'k1',
              userId: 'test-user-id',
              label: 'Default',
              keyPrefix: data.keyPrefix,
              lastUsedAt: null,
              createdAt: new Date().toISOString(),
            });
          },
        );

        const res = await request(httpServer)
          .post('/api/api-keys/k1/rotate')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200);

        const body = res.body as ResponseBody;
        expect(body.key).toMatch(/^hp_/);
        expect(body.id).toBe('k1');
      });

      it('should return 404 for non-existent key', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.apiKey.findFirst.mockResolvedValue(null);

        return request(httpServer)
          .post('/api/api-keys/k1/rotate')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(404);
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

      it('should return messages for owned channel', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.agent.findFirst.mockResolvedValue({
          id: 'a1',
          ownerId: 'test-user-id',
        });
        mockPrisma.message.findMany.mockResolvedValue([
          { id: 'm1', text: 'hello', attachments: [] },
        ]);

        return request(httpServer)
          .get('/api/messages?channel=a1')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200)
          .expect((res) => {
            expect((res.body as ResponseBody).data).toBeDefined();
          });
      });
    });

    describe('GET /api/messages/reviews', () => {
      it('should return pending reviews', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.agent.findMany.mockResolvedValue([{ id: 'a1' }]);
        mockPrisma.message.findMany.mockResolvedValue([]);

        return request(httpServer)
          .get('/api/messages/reviews')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200);
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
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.apiLog.findMany.mockResolvedValue([]);

        return request(httpServer)
          .get('/api/logs')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200)
          .expect((res) => {
            expect((res.body as ResponseBody).data).toBeDefined();
          });
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

      it('should return user preferences', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.userPreferences.findUnique.mockResolvedValue({
          userId: 'test-user-id',
          theme: 'dark',
        });

        return request(httpServer)
          .get('/api/preferences')
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200)
          .expect((res) => {
            expect((res.body as ResponseBody).theme).toBe('dark');
          });
      });
    });

    describe('PATCH /api/preferences', () => {
      it('should update preferences', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          role: 'owner',
        });
        mockPrisma.userPreferences.upsert.mockResolvedValue({
          userId: 'test-user-id',
          theme: 'light',
        });

        return request(httpServer)
          .patch('/api/preferences')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({ theme: 'light' })
          .expect(200)
          .expect((res) => {
            expect((res.body as ResponseBody).theme).toBe('light');
          });
      });
    });
  });

  // ──────────────────────────────────────────────
  // Agent Reviews API (API-key auth)
  // ──────────────────────────────────────────────
  describe('Agent Reviews', () => {
    describe('GET /api/v1/reviews/pending', () => {
      it('should return 401 without API key', () => {
        return request(httpServer).get('/api/v1/reviews/pending').expect(401);
      });
    });

    describe('GET /api/v1/reviews/:id', () => {
      it('should return 401 without API key', () => {
        return request(httpServer).get('/api/v1/reviews/m1').expect(401);
      });
    });

    describe('GET /api/v1/reviews/:id/wait', () => {
      it('should return 401 without API key', () => {
        return request(httpServer).get('/api/v1/reviews/m1/wait').expect(401);
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
  // Agent API (API-key auth)
  // ──────────────────────────────────────────────
  describe('Agent API', () => {
    describe('POST /api/v1/messages', () => {
      it('should return 401 without API key', () => {
        return request(httpServer)
          .post('/api/v1/messages')
          .send({ text: 'hello' })
          .expect(401);
      });
    });

    describe('GET /api/v1/messages', () => {
      it('should return 401 without API key', () => {
        return request(httpServer).get('/api/v1/messages').expect(401);
      });
    });

    describe('GET /api/v1/files', () => {
      it('should return 401 without API key', () => {
        return request(httpServer).get('/api/v1/files').expect(401);
      });
    });
  });

  // ──────────────────────────────────────────────
  // DTO Validation (ZodValidationPipe)
  // ──────────────────────────────────────────────
  describe('DTO Validation', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        email: 'admin@humanproxy.local',
        role: 'owner',
      });
    });

    describe('POST /api/users', () => {
      it('should reject invalid email', () => {
        return request(httpServer)
          .post('/api/users')
          .set('Authorization', `Bearer ${jwtToken}`)
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
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({ email: 'ok@test.com', displayName: 'A', password: 'short' })
          .expect(400);
      });

      it('should strip unknown fields (Zod strips by default, not reject)', async () => {
        // Zod strips unknown keys silently. Verify the request is not
        // rejected with 400 — any other status (e.g. 201 or 409) means
        // the body passed validation successfully.
        const res = await request(httpServer)
          .post('/api/users')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({
            email: 'ok@test.com',
            displayName: 'A',
            password: 'longpassword',
            hack: true,
          });
        expect(res.status).not.toBe(400);
      });
    });

    describe('POST /api/agents', () => {
      it('should reject empty name', () => {
        return request(httpServer)
          .post('/api/agents')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({ name: '' })
          .expect(400);
      });

      it('should reject invalid avatarUrl', () => {
        return request(httpServer)
          .post('/api/agents')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({ name: 'Bot', avatarUrl: 'not-a-url' })
          .expect(400);
      });
    });

    describe('POST /api/auth/login', () => {
      it('should reject missing email', () => {
        return request(httpServer)
          .post('/api/auth/login')
          .send({ password: 'pw' })
          .expect(400);
      });
    });
  });
});
