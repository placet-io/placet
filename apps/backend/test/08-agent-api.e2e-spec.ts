import * as path from 'node:path';
import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state, TEST_FILES } from './setup/test-state';
import type { MessageResponse } from './setup/types';

const httpServer = BASE_URL;

describe('Agent API (/api/v1/)', () => {
  describe('without API key', () => {
    it('POST /api/v1/messages should return 401', () => {
      return request(httpServer)
        .post('/api/v1/messages')
        .send({ channelId: 'fake', text: 'hello' })
        .expect(401);
    });

    it('GET /api/v1/messages should return 401', () => {
      return request(httpServer).get('/api/v1/messages').expect(401);
    });

    it('GET /api/v1/files should return 401', () => {
      return request(httpServer).get('/api/v1/files').expect(401);
    });

    it('GET /api/v1/reviews/pending should return 401', () => {
      return request(httpServer).get('/api/v1/reviews/pending').expect(401);
    });

    it('GET /api/v1/reviews/m1 should return 401', () => {
      return request(httpServer).get('/api/v1/reviews/m1').expect(401);
    });

    it('GET /api/v1/reviews/m1/wait should return 401', () => {
      return request(httpServer).get('/api/v1/reviews/m1/wait').expect(401);
    });
  });

  describe('with valid API key', () => {
    it('should send a message via agent API', async () => {
      const res = await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .send({ channelId: state.agentId, text: 'Hello from E2E agent test' })
        .expect(201);

      const body = res.body as MessageResponse;
      expect(body.channelId).toBe(state.agentId);
      expect(body.senderType).toBe('agent');
      expect(body.text).toBe('Hello from E2E agent test');

      // Store for GET/DELETE tests
      state.agentMessageId = body.id;
    });

    it('should get a single message by ID via agent API', async () => {
      const res = await request(httpServer)
        .get(
          `/api/v1/messages/${state.agentMessageId}?channel=${state.agentId}`,
        )
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      const body = res.body as MessageResponse;
      expect(body.id).toBe(state.agentMessageId);
      expect(body.text).toBe('Hello from E2E agent test');
    });

    it('should return 404 for non-existent message', () => {
      return request(httpServer)
        .get(`/api/v1/messages/nonexistent?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(404);
    });

    it('should list messages via agent API', async () => {
      const res = await request(httpServer)
        .get(`/api/v1/messages?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      const body = res.body as { data: MessageResponse[] };
      expect(body.data).toBeDefined();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should list files via agent API', async () => {
      const res = await request(httpServer)
        .get(`/api/v1/files?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      const body = res.body as unknown[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(TEST_FILES.length);
    });

    it('should list pending reviews via agent API', async () => {
      const res = await request(httpServer)
        .get(`/api/v1/reviews/pending?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 404 for non-existent review', () => {
      return request(httpServer)
        .get(`/api/v1/reviews/nonexistent?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(404);
    });

    it('should send a message with status', async () => {
      const res = await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .send({
          channelId: state.agentId,
          text: 'Deployment finished successfully',
          status: 'success',
        })
        .expect(201);

      const body = res.body as MessageResponse;
      expect(body.status).toBe('success');
    });

    it('should reject message to non-owned agent', () => {
      return request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .send({ channelId: 'nonexistent-agent', text: 'test' })
        .expect(403);
    });

    it('should send a review message and store its ID', async () => {
      const res = await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .send({
          channelId: state.agentId,
          text: 'Approve this deployment?',
          review: {
            type: 'approve',
            label: 'Deploy to production?',
          },
        })
        .expect(201);

      const body = res.body as MessageResponse;
      expect(body.review).toBeDefined();
      state.reviewMessageId = body.id;
    });

    it('should get review by message ID', async () => {
      const res = await request(httpServer)
        .get(
          `/api/v1/reviews/${state.reviewMessageId}?channel=${state.agentId}`,
        )
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      const body = res.body as MessageResponse;
      expect(body.id).toBe(state.reviewMessageId);
      expect(body.review).toBeDefined();
    });

    it('should wait for review with short timeout', async () => {
      const res = await request(httpServer)
        .get(
          `/api/v1/reviews/${state.reviewMessageId}/wait?channel=${state.agentId}&timeout=1000`,
        )
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      // Should time out since no one responded
      const body = res.body as { status: string };
      expect(body.status).toBe('timeout');
    });

    it('should acknowledge a message via agent API', async () => {
      // Send a fresh message to ACK (agentMessageId will be deleted later)
      const createRes = await request(httpServer)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .send({ channelId: state.agentId, text: 'Message to acknowledge' })
        .expect(201);

      const msgId = (createRes.body as MessageResponse).id;

      const res = await request(httpServer)
        .post(`/api/v1/messages/${msgId}/ack?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      const body = res.body as { acknowledged: boolean };
      expect(body.acknowledged).toBe(true);

      // Verify the delivery status was updated
      const getRes = await request(httpServer)
        .get(`/api/v1/messages/${msgId}?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      const msg = getRes.body as MessageResponse;
      expect(msg.deliveryStatus).toBe('agent_received');
    });

    it('should return 404 when acknowledging non-existent message', () => {
      return request(httpServer)
        .post(`/api/v1/messages/nonexistent/ack?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(404);
    });

    it('should delete a message via agent API', async () => {
      const res = await request(httpServer)
        .delete(
          `/api/v1/messages/${state.agentMessageId}?channel=${state.agentId}`,
        )
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200);

      const body = res.body as { deleted: boolean };
      expect(body.deleted).toBe(true);
    });

    it('should return 404 when deleting non-existent message', () => {
      return request(httpServer)
        .delete(`/api/v1/messages/nonexistent?channel=${state.agentId}`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(404);
    });
  });

  describe('Agent file operations (/api/v1/files)', () => {
    let agentFileId: string;

    it('should upload a file via agent API', async () => {
      const filePath = path.join(__dirname, 'input-files', 'csv_example.csv');
      const res = await request(httpServer)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .field('channelId', state.agentId)
        .attach('file', filePath)
        .expect(201);

      const body = res.body as { id: string; filename: string };
      expect(body.id).toBeDefined();
      expect(body.filename).toBe('csv_example.csv');
      agentFileId = body.id;
    });

    it('should store a file via agent API', async () => {
      const filePath = path.join(__dirname, 'input-files', 'html_example.html');
      const res = await request(httpServer)
        .post('/api/v1/files/store')
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .field('channelId', state.agentId)
        .attach('file', filePath)
        .expect(201);

      const body = res.body as { id: string; filename: string };
      expect(body.id).toBeDefined();
      expect(body.filename).toBe('html_example.html');
    });

    it('should download a file via agent API', async () => {
      const res = await request(httpServer)
        .get(`/api/v1/files/${agentFileId}/download`)
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(200)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });

      expect((res.body as Buffer).length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent file download', () => {
      return request(httpServer)
        .get('/api/v1/files/nonexistent/download')
        .set('Authorization', `Bearer ${state.apiKeyRaw}`)
        .expect(404);
    });
  });
});
