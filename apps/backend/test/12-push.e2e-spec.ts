import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state } from './setup/test-state';

const httpServer = BASE_URL;

describe('Push Notifications', () => {
  describe('GET /api/push/vapid-key', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/push/vapid-key').expect(401);
    });

    it('should return VAPID public key', async () => {
      const res = await request(httpServer)
        .get('/api/push/vapid-key')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { publicKey: string };
      // publicKey may be empty string if VAPID_PUBLIC_KEY is not set
      expect(body).toHaveProperty('publicKey');
    });
  });

  describe('POST /api/push/subscribe', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .post('/api/push/subscribe')
        .send({
          endpoint: 'https://push.example.com/sub1',
          keys: { p256dh: 'key1', auth: 'auth1' },
        })
        .expect(401);
    });

    it('should subscribe to push notifications', () => {
      return request(httpServer)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({
          endpoint: 'https://push.example.com/e2e-test',
          keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' },
        })
        .expect(204);
    });
  });

  describe('DELETE /api/push/subscribe', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .delete('/api/push/subscribe')
        .send({ endpoint: 'https://push.example.com/e2e-test' })
        .expect(401);
    });

    it('should unsubscribe from push notifications', () => {
      return request(httpServer)
        .delete('/api/push/subscribe')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ endpoint: 'https://push.example.com/e2e-test' })
        .expect(204);
    });
  });
});
