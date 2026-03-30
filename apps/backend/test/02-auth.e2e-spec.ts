import request from 'supertest';
import { BASE_URL, extractCookie } from './setup/test-app';
import { state, TEST_EMAIL, TEST_PASSWORD } from './setup/test-state';
import type { ResponseBody } from './setup/types';

const httpServer = BASE_URL;

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
      state.accessToken = cookie!;
      state.userId = body.user!.id;
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
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as ResponseBody;
      expect(body.user).toBeDefined();
      expect(body.user!.id).toBe(state.userId);
    });

    it('should set a new access_token cookie', async () => {
      const res = await request(httpServer)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${state.accessToken}`)
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
        .set('Authorization', `Bearer ${state.accessToken}`)
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
      expect(body.user.id).toBe(state.userId);
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
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({})
        .expect(400);
    });

    it('should return 400 with short new password', () => {
      return request(httpServer)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ currentPassword: 'oldpass', newPassword: 'ab' })
        .expect(400);
    });
  });

  describe('POST /api/auth/ws-ticket', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).post('/api/auth/ws-ticket').expect(401);
    });

    it('should return a ws ticket with valid JWT', async () => {
      const res = await request(httpServer)
        .post('/api/auth/ws-ticket')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { ticket: string };
      expect(body.ticket).toBeDefined();
      expect(typeof body.ticket).toBe('string');
      expect(body.ticket.length).toBeGreaterThan(0);
    });
  });
});
