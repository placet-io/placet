import request from 'supertest';
import { BASE_URL, cleanup } from './setup/test-app';
import { state } from './setup/test-state';

const httpServer = BASE_URL;

afterAll(async () => {
  await cleanup();
});

describe('API Logs verification', () => {
  it('should have logged agent API calls', async () => {
    // Give the async log writes a moment to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    const res = await request(httpServer)
      .get('/api/logs')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(200);

    const body = res.body as {
      data: {
        id: string;
        path: string;
        method: string;
        statusCode: number;
      }[];
    };
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    // Verify at least one /api/v1/ log exists
    const v1Logs = body.data.filter((log) => log.path.startsWith('/api/v1/'));
    expect(v1Logs.length).toBeGreaterThanOrEqual(1);

    // Store a log ID for detail test
    state.logId = body.data[0].id;
  });

  it('should get a single log entry by ID', async () => {
    const res = await request(httpServer)
      .get(`/api/logs/${state.logId}`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(200);

    const body = res.body as { id: string; path: string; method: string };
    expect(body.id).toBe(state.logId);
    expect(body.path).toBeDefined();
    expect(body.method).toBeDefined();
  });

  it('should return 404 for non-existent log', () => {
    return request(httpServer)
      .get('/api/logs/nonexistent')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(404);
  });
});
