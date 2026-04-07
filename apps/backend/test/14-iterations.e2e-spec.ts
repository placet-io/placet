import * as path from 'node:path';
import request from 'supertest';
import { BASE_URL, getPrisma } from './setup/test-app';
import { state } from './setup/test-state';
import type { MessageResponse } from './setup/types';

const httpServer = BASE_URL;

// ── Realistic test content ──────────────────────────────────

const REPORT_V1 = `## Q1 2026 Revenue Report

| Metric        | Value     | Δ YoY  |
|--------------|-----------|--------|
| Total Revenue | $1.2M     | +12%   |
| Recurring     | $980K     | +18%   |
| One-time      | $220K     | −4%    |
| Active Users  | 4,200     | +22%   |

### Key Highlights
- Recurring revenue grew 18% driven by enterprise plan upgrades
- Churn rate decreased from 5.2% to 4.1%
- 3 new enterprise customers onboarded in March

### Risks
- One-time revenue declining — need to investigate upsell paths`;

const REPORT_V2 = `## Q1 2026 Revenue Report (Revised)

| Metric         | Value     | Δ YoY  |
|---------------|-----------|--------|
| Total Revenue  | $1.24M    | +15%   |
| Recurring      | $980K     | +18%   |
| One-time       | $260K     | +2%    |
| Active Users   | 4,200     | +22%   |
| **Q2 Forecast**| **$1.4M** | —      |

### Key Highlights
- Recurring revenue grew 18% driven by enterprise plan upgrades
- Churn rate decreased from 5.2% to 4.1%
- 3 new enterprise customers onboarded in March
- **Corrected**: Total Revenue and One-time figures updated after late invoice reconciliation

### Q2 Projections
- Expected 13% growth based on current pipeline
- 2 enterprise deals in final negotiation stage
- New self-serve tier launching mid-April

### Risks
- One-time revenue stabilizing but still below 2024 peak
- Hiring freeze may slow Q2 product velocity`;

const REPORT_V3 = `## Q1 2026 Revenue Report (Final)

| Metric         | Value     | Δ YoY  |
|---------------|-----------|--------|
| Total Revenue  | $1.24M    | +15%   |
| Recurring      | $980K     | +18%   |
| One-time       | $260K     | +2%    |
| Active Users   | 4,200     | +22%   |
| **Q2 Forecast**| **$1.38M**| —      |

### Key Highlights
- Recurring revenue grew 18% driven by enterprise plan upgrades
- Churn rate decreased from 5.2% to 4.1%
- 3 new enterprise customers onboarded in March
- Total Revenue and One-time figures updated after late invoice reconciliation

### Q2 Projections
- Adjusted forecast from $1.4M → **$1.38M** accounting for delayed enterprise deal
- 1 confirmed enterprise deal closing April 10
- 1 enterprise deal pushed to Q3 pipeline
- New self-serve tier launching mid-April — expected $40K incremental MRR

### Risks
- Delayed enterprise deal may push $60K revenue to Q3
- Hiring freeze continues; eng capacity is the bottleneck

### Appendix
- Detailed breakdown attached as PDF
- Regional split available on request`;

const REVIEW_PAYLOAD = {
  type: 'approval' as const,
  payload: {
    options: [
      { id: 'approve', label: 'Approve & Publish', style: 'primary' },
      { id: 'reject', label: 'Reject', style: 'danger' },
    ],
  },
};

// Short companion messages for each iteration
const MSG_V1 =
  'Here is the Q1 2026 revenue report for your review. PDF with detailed breakdown attached.';
const MSG_V2 =
  'Revised per your feedback — corrected total revenue to $1.24M and added Q2 projections.';
const MSG_V3 =
  'Final version: adjusted Q2 forecast from $1.4M to $1.38M and noted the delayed enterprise deal.';

// All unique texts created by this test suite (for cleanup)
const ALL_TEST_TEXTS = [
  MSG_V1,
  MSG_V2,
  MSG_V3,
  'Pending review — do not respond',
  'Deletable root',
  'Deletable iteration 2',
  'Chain A — analytics draft',
  'Chain B — marketing copy',
  'Chain A — analytics revised',
  'Inline text attachment test',
  'Modified files test — please review the draft',
];

/**
 * E2E tests for the HITL Iteration workflow:
 *
 * 1. Agent sends a realistic review message (markdown report + PDF attachment)
 * 2. Human requests changes with detailed feedback
 * 3. Wait-endpoint returns completed immediately
 * 4. Agent sends iteration #2 with revised content + same attachment
 * 5. Human requests changes again (second round of feedback)
 * 6. Agent sends iteration #3 (final revision + updated attachment)
 * 7. Human approves iteration #3
 * 8. Verify full 3-iteration chain via API
 * 9. Rejection of invalid iterationOf targets
 * 10. Deletion protection for iteration chain members
 * 11. Parallel reviews — no cross-contamination
 * Final state: iteration #3 stays pending for frontend inspection
 */
describe('Iteration Workflow (HITL)', () => {
  let iter1Id: string;
  let iter2Id: string;
  let iter3Id: string;
  let pdfFileId1: string;
  let pdfFileId2: string;
  let pdfFileId3: string;
  let mdFileId1: string;
  let mdFileId2: string;
  let mdFileId3: string;

  /** Helper: store an orphan PDF attachment for use with attachmentIds */
  async function storeOrphanPdf(): Promise<string> {
    const filePath = path.join(__dirname, 'input-files', 'pdf_example.pdf');
    const res = await request(httpServer)
      .post('/api/v1/files/store')
      .set('x-api-key', state.apiKeyRaw)
      .field('channelId', state.agentId)
      .attach('file', filePath)
      .expect(201);
    return (res.body as { id: string }).id;
  }

  /** Helper: store text content as a markdown attachment */
  async function storeReportText(
    content: string,
    filename = 'q1-report.md',
  ): Promise<string> {
    const res = await request(httpServer)
      .post('/api/v1/files/store-text')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        content,
        filename,
        mimeType: 'text/markdown',
      })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  beforeAll(async () => {
    // Clean up messages from previous test runs
    const prisma = getPrisma();
    await prisma.message.deleteMany({
      where: {
        channelId: state.agentId,
        text: { in: ALL_TEST_TEXTS },
      },
    });
  });

  // ── Upload PDF attachments (one per iteration) ─────────────

  it('should store orphan PDF and markdown attachments for all iterations', async () => {
    [pdfFileId1, pdfFileId2, pdfFileId3] = await Promise.all([
      storeOrphanPdf(),
      storeOrphanPdf(),
      storeOrphanPdf(),
    ]);
    [mdFileId1, mdFileId2, mdFileId3] = await Promise.all([
      storeReportText(REPORT_V1, 'q1-report.md'),
      storeReportText(REPORT_V2, 'q1-report.md'),
      storeReportText(REPORT_V3, 'q1-report.md'),
    ]);
    expect(pdfFileId1).toBeDefined();
    expect(mdFileId1).toBeDefined();
  });

  // ── Iteration 1: Initial draft ────────────────────────────

  it('should send iteration #1 (initial report with PDF)', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: MSG_V1,
        status: 'warning',
        metadata: { agent: 'report-bot', runId: 'run-001', model: 'gpt-4o' },
        attachmentIds: [mdFileId1, pdfFileId1],
        review: REVIEW_PAYLOAD,
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.review).toBeDefined();
    expect(body.attachments).toHaveLength(2);
    iter1Id = body.id;
  });

  // ── Human requests changes (round 1) ─────────────────────

  it('should allow human to respond with feedback', async () => {
    const res = await request(httpServer)
      .post(`/api/messages/${iter1Id}/respond`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        response: { selectedOption: 'reject' },
        feedback:
          'Total Revenue looks off — we had a late invoice batch that should bring it to ~$1.24M. ' +
          'Also please add Q2 projections and adjust the growth figure.',
      })
      .expect(201);

    const review = (res.body as MessageResponse).review as Record<
      string,
      unknown
    >;
    expect(review.status).toBe('completed');
    expect(review.feedback).toBeDefined();
  });

  // ── Wait-endpoint returns immediately ─────────────────────

  it('should return completed immediately from wait endpoint', async () => {
    const res = await request(httpServer)
      .get(
        `/api/v1/reviews/${iter1Id}/wait?channel=${state.agentId}&timeout=2000`,
      )
      .set('x-api-key', state.apiKeyRaw)
      .expect(200);

    const body = res.body as { status: string; message: MessageResponse };
    expect(body.status).toBe('completed');
    expect(body.message.id).toBe(iter1Id);
  });

  // ── Iteration 2: Revised draft ────────────────────────────

  it('should send iteration #2 with revised content and attachment', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: MSG_V2,
        status: 'warning',
        metadata: { agent: 'report-bot', runId: 'run-002', model: 'gpt-4o' },
        attachmentIds: [mdFileId2, pdfFileId2],
        iterationOf: iter1Id,
        review: REVIEW_PAYLOAD,
      })
      .expect(201);

    const body = res.body as MessageResponse & {
      iterationGroupId: string;
      iteration: number;
    };
    expect(body.iterationGroupId).toBe(iter1Id);
    expect(body.iteration).toBe(2);
    expect(body.attachments).toHaveLength(2);
    iter2Id = body.id;
  });

  // ── Human requests changes again (round 2) ───────────────

  it('should allow human to respond a second time with feedback', async () => {
    const res = await request(httpServer)
      .post(`/api/messages/${iter2Id}/respond`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        response: { selectedOption: 'reject' },
        feedback:
          'Q2 forecast of $1.4M seems too optimistic — the Acme deal got pushed. ' +
          'Please adjust to ~$1.38M and note the pipeline risk.',
      })
      .expect(201);

    const review = (res.body as MessageResponse).review as Record<
      string,
      unknown
    >;
    expect(review.status).toBe('completed');
  });

  // ── Iteration 3: Final revision (stays pending!) ──────────

  it('should send iteration #3 with final revision (pending review)', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: MSG_V3,
        status: 'warning',
        metadata: { agent: 'report-bot', runId: 'run-003', model: 'gpt-4o' },
        attachmentIds: [mdFileId3, pdfFileId3],
        iterationOf: iter2Id,
        review: REVIEW_PAYLOAD,
      })
      .expect(201);

    const body = res.body as MessageResponse & {
      iterationGroupId: string;
      iteration: number;
    };
    expect(body.iterationGroupId).toBe(iter1Id);
    expect(body.iteration).toBe(3);
    expect(body.attachments).toHaveLength(2);
    // NOTE: We intentionally do NOT respond to this review.
    // It stays pending so the iteration chain is visible in the frontend inbox.
    iter3Id = body.id;
  });

  // ── Verify 3-iteration chain via agent API ────────────────

  it('should return the full 3-iteration chain via agent API', async () => {
    const res = await request(httpServer)
      .get(`/api/v1/messages/iterations/${iter3Id}?channel=${state.agentId}`)
      .set('x-api-key', state.apiKeyRaw)
      .expect(200);

    const body = res.body as {
      groupId: string;
      iterations: Array<MessageResponse & { iteration: number }>;
    };
    expect(body.groupId).toBe(iter1Id);
    expect(body.iterations).toHaveLength(3);
    expect(body.iterations[0].iteration).toBe(1);
    expect(body.iterations[1].iteration).toBe(2);
    expect(body.iterations[2].iteration).toBe(3);
    expect(body.iterations[0].id).toBe(iter1Id);
    expect(body.iterations[1].id).toBe(iter2Id);
    expect(body.iterations[2].id).toBe(iter3Id);
  });

  // ── Verify chain via frontend API ─────────────────────────

  it('should return the iteration chain via frontend API', async () => {
    const res = await request(httpServer)
      .get(`/api/messages/${iter3Id}/iterations?channel=${state.agentId}`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(200);

    const body = res.body as {
      groupId: string;
      iterations: Array<MessageResponse & { iteration: number }>;
    };
    expect(body.iterations).toHaveLength(3);
    expect(body.iterations[2].iteration).toBe(3);
  });

  // ── Wait-endpoint returns completed after approval ────────

  it('should return completed from wait endpoint for approved iteration', async () => {
    // iter2 was completed — wait should return immediately
    const res = await request(httpServer)
      .get(
        `/api/v1/reviews/${iter2Id}/wait?channel=${state.agentId}&timeout=2000`,
      )
      .set('x-api-key', state.apiKeyRaw)
      .expect(200);

    expect((res.body as { status: string }).status).toBe('completed');
  });

  // ── Rejection of invalid iterationOf targets ──────────────

  it('should reject iterationOf pointing to nonexistent message', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Bad iteration',
        iterationOf: 'nonexistent-message-id',
      })
      .expect(400);
  });

  it('should reject iterationOf on a pending review (not yet responded)', async () => {
    // Send a new review that stays pending
    const pendingRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Pending review — do not respond',
        review: {
          type: 'approval',
          payload: { options: [{ id: 'approve', label: 'OK' }] },
        },
      })
      .expect(201);

    const pendingId = (pendingRes.body as MessageResponse).id;

    // Try to iterate on a pending review
    await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Should fail — target review is still pending',
        iterationOf: pendingId,
      })
      .expect(400);
  });

  // ── Deletion protection for chains ────────────────────────

  it('should prevent deletion of iteration root message', async () => {
    await request(httpServer)
      .delete(`/api/v1/messages/${iter1Id}?channel=${state.agentId}`)
      .set('x-api-key', state.apiKeyRaw)
      .expect(400);
  });

  it('should block deletion of any message in a multi-member chain', async () => {
    // Create an expendable iteration chain for this test
    const rootRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Deletable root',
        review: {
          type: 'approval',
          payload: { options: [{ id: 'ok', label: 'OK' }] },
        },
      })
      .expect(201);

    const rootId = (rootRes.body as MessageResponse).id;

    await request(httpServer)
      .post(`/api/messages/${rootId}/respond`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ response: { selectedOption: 'ok' } })
      .expect(201);

    const iter2Res = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Deletable iteration 2',
        iterationOf: rootId,
      })
      .expect(201);

    const delIter2Id = (iter2Res.body as MessageResponse).id;

    await request(httpServer)
      .delete(`/api/v1/messages/${rootId}?channel=${state.agentId}`)
      .set('x-api-key', state.apiKeyRaw)
      .expect(400);

    await request(httpServer)
      .delete(`/api/v1/messages/${delIter2Id}?channel=${state.agentId}`)
      .set('x-api-key', state.apiKeyRaw)
      .expect(400);
  });

  // ── Parallel reviews — no cross-contamination ─────────────

  it('should keep parallel iteration chains isolated', async () => {
    const [resA, resB] = await Promise.all([
      request(httpServer)
        .post('/api/v1/messages')
        .set('x-api-key', state.apiKeyRaw)
        .send({
          channelId: state.agentId,
          text: 'Chain A — analytics draft',
          status: 'info',
          review: REVIEW_PAYLOAD,
        }),
      request(httpServer)
        .post('/api/v1/messages')
        .set('x-api-key', state.apiKeyRaw)
        .send({
          channelId: state.agentId,
          text: 'Chain B — marketing copy',
          status: 'info',
          review: REVIEW_PAYLOAD,
        }),
    ]);

    const idA = (resA.body as MessageResponse).id;
    const idB = (resB.body as MessageResponse).id;

    // Respond to chain A with feedback
    await request(httpServer)
      .post(`/api/messages/${idA}/respond`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        response: { selectedOption: 'reject' },
        feedback: 'Please add conversion funnel data.',
      })
      .expect(201);

    // Approve chain B
    await request(httpServer)
      .post(`/api/messages/${idB}/respond`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ response: { selectedOption: 'approve' } })
      .expect(201);

    // Iterate on chain A only
    const iterA = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Chain A — analytics revised',
        status: 'info',
        iterationOf: idA,
        review: REVIEW_PAYLOAD,
      })
      .expect(201);

    const iterABody = iterA.body as MessageResponse & {
      iterationGroupId: string;
      iteration: number;
    };
    expect(iterABody.iterationGroupId).toBe(idA);
    expect(iterABody.iteration).toBe(2);

    // Chain B should still have only 1 iteration (standalone, no group)
    const chainB = await request(httpServer)
      .get(`/api/v1/messages/iterations/${idB}?channel=${state.agentId}`)
      .set('x-api-key', state.apiKeyRaw)
      .expect(200);

    const chainBBody = chainB.body as {
      iterations: Array<{ iteration: number | null }>;
    };
    expect(chainBBody.iterations).toHaveLength(1);
    expect(chainBBody.iterations[0].iteration).toBeNull();

    // Chain A should have 2 iterations
    const chainA = await request(httpServer)
      .get(
        `/api/v1/messages/iterations/${iterABody.id}?channel=${state.agentId}`,
      )
      .set('x-api-key', state.apiKeyRaw)
      .expect(200);

    const chainABody = chainA.body as {
      iterations: Array<{ iteration: number }>;
    };
    expect(chainABody.iterations).toHaveLength(2);
  });

  // ── Inline textAttachments ────────────────────────────────

  it('should accept inline textAttachments and return textContent in response', async () => {
    const markdownContent = '# Hello\n\nThis is an **inline** text attachment.';

    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Inline text attachment test',
        textAttachments: [
          {
            content: markdownContent,
            filename: 'notes.md',
            mimeType: 'text/markdown',
          },
        ],
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments![0].filename).toBe('notes.md');
    expect(body.attachments![0].mimeType).toBe('text/markdown');
    // Agent API response should include inline textContent
    expect((body.attachments![0] as Record<string, unknown>).textContent).toBe(
      markdownContent,
    );
  });

  it('should accept textAttachments with defaults (filename and mimeType)', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Inline text attachment test',
        textAttachments: [{ content: 'Just some text' }],
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments![0].filename).toBe('content.md');
    expect(body.attachments![0].mimeType).toBe('text/markdown');
  });

  // ── modifiedFileIds in review response ────────────────────

  it('should store modifiedFileIds in review response', async () => {
    // Create a message with an attachment and review
    const mdId = await storeReportText('Draft content', 'draft.md');
    const msgRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Modified files test — please review the draft',
        attachmentIds: [mdId],
        review: REVIEW_PAYLOAD,
      })
      .expect(201);

    const msgId = (msgRes.body as MessageResponse).id;
    const originalAttId = (msgRes.body as MessageResponse).attachments![0].id;

    // Human edits the attachment → store modified version
    const modifiedId = await storeReportText(
      'Edited content by human',
      'draft-edited.md',
    );

    // Respond with modifiedFileIds mapping original → modified
    const respondRes = await request(httpServer)
      .post(`/api/messages/${msgId}/respond`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        response: { selectedOption: 'approve' },
        modifiedFileIds: { [originalAttId]: modifiedId },
      })
      .expect(201);

    const review = (respondRes.body as MessageResponse).review as Record<
      string,
      unknown
    >;
    expect(review.status).toBe('completed');
    expect(review.modifiedFileIds).toEqual({ [originalAttId]: modifiedId });
  });

  // ── Wait endpoint returns enriched textContent ────────────

  it('should return textContent in wait endpoint response for text attachments', async () => {
    const content = '# Wait enrichment test\n\nThis should appear inline.';

    // Create message with inline textAttachment + review
    const msgRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('x-api-key', state.apiKeyRaw)
      .send({
        channelId: state.agentId,
        text: 'Inline text attachment test',
        textAttachments: [{ content, filename: 'wait-test.md' }],
        review: REVIEW_PAYLOAD,
      })
      .expect(201);

    const msgId = (msgRes.body as MessageResponse).id;

    // Human approves the review
    await request(httpServer)
      .post(`/api/messages/${msgId}/respond`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ response: { selectedOption: 'approve' } })
      .expect(201);

    // Agent calls wait endpoint — should get enriched textContent
    const waitRes = await request(httpServer)
      .get(
        `/api/v1/reviews/${msgId}/wait?channel=${state.agentId}&timeout=2000`,
      )
      .set('x-api-key', state.apiKeyRaw)
      .expect(200);

    const waitBody = waitRes.body as {
      status: string;
      message: MessageResponse;
    };
    expect(waitBody.status).toBe('completed');
    expect(waitBody.message.attachments).toHaveLength(1);
    expect(
      (waitBody.message.attachments![0] as Record<string, unknown>).textContent,
    ).toBe(content);
  });
});
