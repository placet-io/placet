import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state } from './setup/test-state';

const httpServer = BASE_URL;

let tempUserId: string;

describe('Users', () => {
  describe('GET /api/users', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/users').expect(401);
    });

    it('should return users list with valid JWT', async () => {
      const res = await request(httpServer)
        .get('/api/users')
        .set('Authorization', `Bearer ${state.accessToken}`)
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
        .set('Authorization', `Bearer ${state.accessToken}`)
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
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ email: 'ok@test.com', displayName: 'A', password: 'short' })
        .expect(400);
    });

    it('should create a new user', async () => {
      const res = await request(httpServer)
        .post('/api/users')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({
          email: 'e2e-temp@test.com',
          displayName: 'E2E Temp User',
          password: 'longpassword123',
        })
        .expect(201);

      const body = res.body as { id: string; email: string };
      expect(body.email).toBe('e2e-temp@test.com');
      expect(body.id).toBeDefined();
      tempUserId = body.id;
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .patch(`/api/users/${tempUserId}`)
        .send({ displayName: 'Updated' })
        .expect(401);
    });

    it('should update a user', async () => {
      const res = await request(httpServer)
        .patch(`/api/users/${tempUserId}`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ displayName: 'Updated Name' })
        .expect(200);

      const body = res.body as { id: string; displayName: string };
      expect(body.displayName).toBe('Updated Name');
    });

    it('should return 404 for non-existent user', () => {
      return request(httpServer)
        .patch('/api/users/nonexistent')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ displayName: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).delete(`/api/users/${tempUserId}`).expect(401);
    });

    it('should not allow deleting own account', () => {
      return request(httpServer)
        .delete(`/api/users/${state.userId}`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(403);
    });

    it('should delete a user', async () => {
      const res = await request(httpServer)
        .delete(`/api/users/${tempUserId}`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { deleted: boolean };
      expect(body.deleted).toBe(true);
    });

    it('should return 404 for non-existent user', () => {
      return request(httpServer)
        .delete('/api/users/nonexistent')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });
  });
});
