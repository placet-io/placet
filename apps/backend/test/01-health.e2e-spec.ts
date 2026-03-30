import request from 'supertest';
import { BASE_URL, cleanupTestData } from './setup/test-app';
import type { ResponseBody } from './setup/types';

const httpServer = BASE_URL;

beforeAll(async () => {
  await cleanupTestData();
}, 30_000);

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
