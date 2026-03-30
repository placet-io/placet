import * as path from 'node:path';
import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state } from './setup/test-state';

const httpServer = BASE_URL;

describe('Agents', () => {
  describe('GET /api/agents', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/agents').expect(401);
    });

    it('should return agents list with valid JWT', async () => {
      const res = await request(httpServer)
        .get('/api/agents')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/agents', () => {
    it('should create an agent', async () => {
      const res = await request(httpServer)
        .post('/api/agents')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ name: 'E2E Test Bot' })
        .expect(201);

      const body = res.body as { id: string; name: string };
      expect(body.name).toBe('E2E Test Bot');
      expect(body.id).toBeDefined();

      // Store for subsequent tests
      state.agentId = body.id;
    });

    it('should reject empty name', () => {
      return request(httpServer)
        .post('/api/agents')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ name: '' })
        .expect(400);
    });

    it('should reject invalid avatarUrl', () => {
      return request(httpServer)
        .post('/api/agents')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ name: 'Bot', avatarUrl: 'not-a-url' })
        .expect(400);
    });
  });

  describe('PATCH /api/agents/:id', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .patch(`/api/agents/${state.agentId}`)
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('should update agent name', async () => {
      const res = await request(httpServer)
        .patch(`/api/agents/${state.agentId}`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ name: 'E2E Test Bot' })
        .expect(200);

      const body = res.body as { id: string; name: string };
      expect(body.name).toBe('E2E Test Bot');
    });

    it('should return 404 for non-existent agent', () => {
      return request(httpServer)
        .patch('/api/agents/nonexistent')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('POST /api/agents/:id/read', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .post(`/api/agents/${state.agentId}/read`)
        .expect(401);
    });

    it('should mark agent as read', () => {
      return request(httpServer)
        .post(`/api/agents/${state.agentId}/read`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(201);
    });

    it('should return 404 for non-existent agent', () => {
      return request(httpServer)
        .post('/api/agents/nonexistent/read')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });
  });

  describe('Agent avatar', () => {
    it('POST /api/agents/:id/avatar should upload avatar', async () => {
      const avatarPath = path.join(__dirname, 'input-files', 'png_example.png');
      const res = await request(httpServer)
        .post(`/api/agents/${state.agentId}/avatar`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .attach('file', avatarPath)
        .expect(201);

      const body = res.body as { id: string; avatarUrl: string | null };
      expect(body.avatarUrl).toBeDefined();
    });

    it('GET /api/agents/:id/avatar should return the avatar image', async () => {
      const res = await request(httpServer)
        .get(`/api/agents/${state.agentId}/avatar`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200)
        .buffer(true);

      expect(res.headers['content-type']).toContain('image/');
      expect((res.body as Buffer).length).toBeGreaterThan(0);
    });

    it('DELETE /api/agents/:id/avatar should remove the avatar', async () => {
      const res = await request(httpServer)
        .delete(`/api/agents/${state.agentId}/avatar`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { id: string; avatarUrl: string | null };
      expect(body.avatarUrl).toBeNull();
    });

    it('GET /api/agents/:id/avatar should return 404 after removal', () => {
      return request(httpServer)
        .get(`/api/agents/${state.agentId}/avatar`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });
  });
});
