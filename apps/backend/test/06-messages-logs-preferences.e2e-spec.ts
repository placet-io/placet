import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state } from './setup/test-state';
import type { ResponseBody } from './setup/types';

const httpServer = BASE_URL;

describe('Messages', () => {
  describe('GET /api/messages', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/messages?channel=a1').expect(401);
    });

    it('should return messages for owned agent', async () => {
      const res = await request(httpServer)
        .get(`/api/messages?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      expect((res.body as ResponseBody).data).toBeDefined();
    });
  });

  describe('GET /api/messages/reviews', () => {
    it('should return pending reviews', async () => {
      const res = await request(httpServer)
        .get('/api/messages/reviews')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});

describe('Logs', () => {
  describe('GET /api/logs', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/logs').expect(401);
    });

    it('should return logs with valid JWT', async () => {
      const res = await request(httpServer)
        .get('/api/logs')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      expect((res.body as ResponseBody).data).toBeDefined();
    });
  });
});

describe('Preferences', () => {
  describe('GET /api/preferences', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/preferences').expect(401);
    });

    it('should return user preferences', () => {
      return request(httpServer)
        .get('/api/preferences')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);
    });
  });

  describe('PATCH /api/preferences', () => {
    it('should update preferences', async () => {
      const res = await request(httpServer)
        .patch('/api/preferences')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ theme: 'dark' })
        .expect(200);

      expect((res.body as ResponseBody).theme).toBe('dark');
    });
  });
});
