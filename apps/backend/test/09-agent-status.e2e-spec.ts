import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state } from './setup/test-state';

const httpServer = BASE_URL;

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
        .set('x-api-key', state.apiKeyRaw)
        .send({ agentId: state.agentId, status: 'active' })
        .expect(201);

      const body = res.body as {
        id: string;
        status: string;
        statusMessage: string | null;
        statusSince: string | null;
      };
      expect(body.id).toBe(state.agentId);
      expect(body.status).toBe('active');
      expect(body.statusSince).toBeDefined();
    });

    it('should set agent status to busy with message', async () => {
      const res = await request(httpServer)
        .post('/api/v1/status/ping')
        .set('x-api-key', state.apiKeyRaw)
        .send({
          agentId: state.agentId,
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
        .set('x-api-key', state.apiKeyRaw)
        .send({
          agentId: state.agentId,
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
        .set('x-api-key', state.apiKeyRaw)
        .send({ agentId: state.agentId, status: 'active' })
        .expect(201);

      const body = res.body as { status: string };
      expect(body.status).toBe('active');
    });

    it('should reject invalid status value', () => {
      return request(httpServer)
        .post('/api/v1/status/ping')
        .set('x-api-key', state.apiKeyRaw)
        .send({ agentId: state.agentId, status: 'invalid' })
        .expect(400);
    });

    it('should reject missing agentId', () => {
      return request(httpServer)
        .post('/api/v1/status/ping')
        .set('x-api-key', state.apiKeyRaw)
        .send({ status: 'active' })
        .expect(400);
    });

    it('should reject non-owned agent', () => {
      return request(httpServer)
        .post('/api/v1/status/ping')
        .set('x-api-key', state.apiKeyRaw)
        .send({ agentId: 'nonexistent', status: 'active' })
        .expect(404);
    });
  });

  describe('GET /api/agents/:id/stats', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .get(`/api/agents/${state.agentId}/stats`)
        .expect(401);
    });

    it('should return agent statistics', async () => {
      const res = await request(httpServer)
        .get(`/api/agents/${state.agentId}/stats`)
        .set('Authorization', `Bearer ${state.accessToken}`)
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
        .set('Authorization', `Bearer ${state.accessToken}`)
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
        .set('Authorization', `Bearer ${state.accessToken}`)
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
