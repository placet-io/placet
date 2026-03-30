import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state } from './setup/test-state';
import type { ResponseBody } from './setup/types';

const httpServer = BASE_URL;

describe('API Keys', () => {
  describe('GET /api/api-keys', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/api-keys').expect(401);
    });

    it('should return API keys list with valid JWT', async () => {
      const res = await request(httpServer)
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/api-keys', () => {
    it('should create an API key and return the full key once', async () => {
      const res = await request(httpServer)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ label: 'E2E Test Key' })
        .expect(201);

      const body = res.body as ResponseBody;
      expect(body.key).toMatch(/^hp_/);
      expect(body.label).toBe('E2E Test Key');
      expect(body.id).toBeDefined();

      // Store for subsequent tests
      state.apiKeyId = body.id!;
      state.apiKeyRaw = body.key!;
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
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });

    it('should rotate an API key and return new key', async () => {
      const res = await request(httpServer)
        .post(`/api/api-keys/${state.apiKeyId}/rotate`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as ResponseBody;
      expect(body.key).toMatch(/^hp_/);
      expect(body.id).toBe(state.apiKeyId);

      // Update stored key (old one is now invalid)
      state.apiKeyRaw = body.key!;
    });
  });

  describe('DELETE /api/api-keys/:id', () => {
    let tempKeyId: string;

    it('should create a temporary key for deletion test', async () => {
      const res = await request(httpServer)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ label: 'E2E Temp Key' })
        .expect(201);

      tempKeyId = (res.body as ResponseBody).id!;
    });

    it('should return 401 without auth', () => {
      return request(httpServer)
        .delete(`/api/api-keys/${tempKeyId}`)
        .expect(401);
    });

    it('should return 404 for non-existent key', () => {
      return request(httpServer)
        .delete('/api/api-keys/nonexistent')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });

    it('should delete an API key', async () => {
      const res = await request(httpServer)
        .delete(`/api/api-keys/${tempKeyId}`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { deleted: boolean };
      expect(body.deleted).toBe(true);
    });
  });
});
