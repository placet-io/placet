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
};

interface ResponseBody {
  status?: string;
  timestamp?: string;
  message?: string;
  data?: unknown[];
  theme?: string;
  apiKey?: string;
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
          { id: 'a1', name: 'Bot', apiKeyPrefix: 'hp_abc12345' },
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
      it('should create an agent and return API key', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          id: 'test-user-id',
          email: 'admin@humanproxy.local',
          role: 'owner',
        });
        mockPrisma.agent.create.mockResolvedValue({
          id: 'a1',
          name: 'TestBot',
          apiKeyPrefix: 'hp_abc12345',
        });

        return request(httpServer)
          .post('/api/agents')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({ name: 'TestBot' })
          .expect(201)
          .expect((res) => {
            expect((res.body as ResponseBody).apiKey).toMatch(/^hp_/);
          });
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
