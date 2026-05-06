import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state } from './setup/test-state';
import type { MessageResponse } from './setup/types';

const httpServer = BASE_URL;

describe('Streaming Messages (/api/v1/messages/streams)', () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it('should reject stream updates without an API key', async () => {
    await request(httpServer)
      .patch(`/api/v1/messages/streams/e2e-unauthorized-${runId}`)
      .send({ channelId: state.agentId, text: 'nope' })
      .expect(401);

    await request(httpServer)
      .post(`/api/v1/messages/streams/e2e-unauthorized-${runId}/status`)
      .send({ channelId: state.agentId, text: 'nope' })
      .expect(401);
  });

  it('should persist status events before the stream draft exists and return them with the draft', async () => {
    const streamId = `e2e-status-before-draft-${runId}`;
    const draftText = `E2E streaming draft ${runId}`;

    await request(httpServer)
      .post(`/api/v1/messages/streams/${streamId}/status`)
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Reading repository context',
        toolHint: true,
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            channelId: state.agentId,
            streamId,
            index: 0,
            text: 'Reading repository context',
            toolHint: true,
          }),
        );
      });

    await request(httpServer)
      .post(`/api/v1/messages/streams/${streamId}/status`)
      .set('x-api-key', state.apiKeyRaw)
      .send({ channelId: state.agentId, text: 'Preparing answer' })
      .expect(201)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            channelId: state.agentId,
            streamId,
            index: 1,
            text: 'Preparing answer',
            toolHint: false,
          }),
        );
      });

    const createRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: draftText,
        streamId,
        streamState: 'streaming',
      })
      .expect(201);

    const created = createRes.body as MessageResponse;
    expect(created.streamId).toBe(streamId);
    expect(created.streamState).toBe('streaming');

    const listRes = await request(httpServer)
      .get(
        `/api/v1/messages?channel=${state.agentId}&search=${encodeURIComponent(draftText)}`,
      )
      .set('x-api-key', state.apiKeyRaw)
      .expect(200);

    const matches = (listRes.body as { data: MessageResponse[] }).data.filter(
      (message) => message.streamId === streamId,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].statusEvents).toEqual([
      expect.objectContaining({
        streamId,
        index: 0,
        text: 'Reading repository context',
        toolHint: true,
      }),
      expect.objectContaining({
        streamId,
        index: 1,
        text: 'Preparing answer',
        toolHint: false,
      }),
    ]);
  });

  it('should update a streaming draft and mark it complete', async () => {
    const streamId = `e2e-complete-${runId}`;

    const createRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Partial answer',
        streamId,
        streamState: 'streaming',
      })
      .expect(201);

    const messageId = (createRes.body as MessageResponse).id;

    const patchRes = await request(httpServer)
      .patch(`/api/v1/messages/streams/${streamId}`)
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Final answer',
        complete: true,
      })
      .expect(200);

    const body = patchRes.body as MessageResponse;
    expect(body.id).toBe(messageId);
    expect(body.text).toBe('Final answer');
    expect(body.streamId).toBe(streamId);
    expect(body.streamState).toBe('complete');
  });

  it('should mark a streaming draft aborted through PATCH', async () => {
    const streamId = `e2e-abort-patch-${runId}`;

    const createRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Partial answer before stop',
        streamId,
        streamState: 'streaming',
      })
      .expect(201);

    const messageId = (createRes.body as MessageResponse).id;

    const patchRes = await request(httpServer)
      .patch(`/api/v1/messages/streams/${streamId}`)
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Stopped by user.',
        streamState: 'aborted',
      })
      .expect(200);

    const body = patchRes.body as MessageResponse;
    expect(body.id).toBe(messageId);
    expect(body.text).toBe('Stopped by user.');
    expect(body.streamState).toBe('aborted');
  });

  it('should abort an existing stream draft idempotently when create is retried with the same streamId', async () => {
    const streamId = `e2e-abort-create-${runId}`;

    const createRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Draft before retry abort',
        streamId,
        streamState: 'streaming',
      })
      .expect(201);

    const first = createRes.body as MessageResponse;

    const abortRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Interrupted.',
        streamId,
        streamState: 'aborted',
      })
      .expect(201);

    const aborted = abortRes.body as MessageResponse;
    expect(aborted.id).toBe(first.id);
    expect(aborted.text).toBe('Interrupted.');
    expect(aborted.streamState).toBe('aborted');

    const listRes = await request(httpServer)
      .get(
        `/api/v1/messages?channel=${state.agentId}&search=${encodeURIComponent('Interrupted.')}`,
      )
      .set('x-api-key', state.apiKeyRaw)
      .expect(200);

    const matches = (listRes.body as { data: MessageResponse[] }).data.filter(
      (message) => message.streamId === streamId,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(first.id);
  });

  it('should reject invalid stream states', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Invalid stream state',
        streamId: `e2e-invalid-create-${runId}`,
        streamState: 'interrupted',
      })
      .expect(400);

    await request(httpServer)
      .patch(`/api/v1/messages/streams/e2e-invalid-patch-${runId}`)
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Invalid stream state',
        streamState: 'interrupted',
      })
      .expect(400);
  });
});
