import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { BASE_URL, getPrisma } from './setup/test-app';
import { state } from './setup/test-state';
import type { MessageResponse } from './setup/types';

const httpServer = BASE_URL;
let prisma: PrismaClient;

beforeAll(() => {
  prisma = getPrisma();
}, 30_000);

describe('Chat showcase (diverse messages for frontend)', () => {
  // ── Normal text messages ──────────────────────────────────
  it('should send a plain agent message', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: "Hey! I finished crawling the sitemap. Found **247 pages** across 12 sub-domains.\n\nHere's a quick breakdown:\n- Marketing: 89 pages\n- Docs: 104 pages\n- Blog: 54 pages\n\nNo broken links detected.",
      })
      .expect(201);

    expect((res.body as MessageResponse).senderType).toBe('agent');
  });

  it('should send a user reply', async () => {
    await request(httpServer)
      .post('/api/messages')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        channelId: state.agentId,
        text: 'Awesome, can you check the docs section for outdated content?',
      })
      .expect(201);
  });

  // ── Status messages ───────────────────────────────────────
  it('should send an info status message', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Scan started — checking docs section for pages last updated more than 6 months ago.',
        status: 'info',
      })
      .expect(201);
  });

  it('should send a warning status message', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Found **18 pages** with outdated content (last edit > 6 months). 3 pages reference deprecated API endpoints.',
        status: 'warning',
      })
      .expect(201);
  });

  it('should send an error status message', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Failed to reach `docs.example.com/api/v1` — DNS resolution timed out after 30 s.',
        status: 'error',
      })
      .expect(201);
  });

  it('should send a success status message', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Recovery complete — the endpoint is reachable again. All 247 pages re-validated.',
        status: 'success',
      })
      .expect(201);
  });

  // ── Approval review ───────────────────────────────────────
  it('should send an approval review', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: "I'd like to auto-redirect 12 old blog URLs to their updated equivalents. This will set up 301 redirects in the CDN config.\n\nShould I proceed?",
        status: 'warning',
        review: {
          type: 'approval',
          payload: {
            options: [
              { id: 'approve', label: 'Yes, set up redirects' },
              { id: 'reject', label: 'No, skip for now', style: 'danger' },
            ],
            allowComment: true,
          },
        },
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.review).toBeDefined();
  });

  // ── Selection review (single) ─────────────────────────────
  it('should send a single-selection review', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Which deployment strategy should I use for the next release?',
        review: {
          type: 'selection',
          payload: {
            mode: 'single',
            items: [
              {
                id: 'rolling',
                label: 'Rolling update',
                description: 'Gradually replace instances — zero downtime',
              },
              {
                id: 'blue-green',
                label: 'Blue/Green',
                description: 'Switch traffic at once after full deployment',
              },
              {
                id: 'canary',
                label: 'Canary',
                description: 'Route 5% of traffic first, then ramp up',
              },
            ],
          },
        },
      })
      .expect(201);
  });

  // ── Selection review (multi) ──────────────────────────────
  it('should send a multi-selection review', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Select the notification channels for critical alerts:',
        review: {
          type: 'selection',
          payload: {
            mode: 'multi',
            items: [
              {
                id: 'email',
                label: 'Email',
                description: 'admin@company.com',
              },
              {
                id: 'slack',
                label: 'Slack',
                description: '#ops-alerts channel',
              },
              {
                id: 'pagerduty',
                label: 'PagerDuty',
                description: 'Escalation policy: P1',
              },
              { id: 'sms', label: 'SMS', description: '+1 555-0123' },
            ],
          },
        },
      })
      .expect(201);
  });

  // ── Form review ───────────────────────────────────────────
  it('should send a form review', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'I need a few details to configure the new staging environment:',
        review: {
          type: 'form',
          payload: {
            fields: [
              {
                name: 'envName',
                type: 'text',
                label: 'Environment name',
                required: true,
              },
              {
                name: 'region',
                type: 'select',
                label: 'AWS Region',
                required: true,
                options: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
              },
              {
                name: 'instanceCount',
                type: 'number',
                label: 'Number of instances',
                required: true,
              },
              {
                name: 'notes',
                type: 'textarea',
                label: 'Additional notes',
                required: false,
              },
            ],
          },
        },
      })
      .expect(201);
  });

  // ── Form review with new field types (date, time, datetime, range, password) ──
  it('should send a form review with date/time/datetime fields', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Please provide the deployment schedule:',
        review: {
          type: 'form',
          payload: {
            fields: [
              {
                name: 'deployDate',
                type: 'date',
                label: 'Deployment date',
                required: true,
              },
              {
                name: 'maintenanceStart',
                type: 'time',
                label: 'Maintenance window start',
                required: true,
              },
              {
                name: 'rollbackDeadline',
                type: 'datetime',
                label: 'Rollback deadline',
                required: false,
              },
            ],
          },
        },
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.review).toBeDefined();
  });

  it('should send a form review with range (slider) field', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Configure the auto-scaling parameters:',
        review: {
          type: 'form',
          payload: {
            fields: [
              {
                name: 'cpuThreshold',
                type: 'range',
                label: 'CPU scale-up threshold',
                required: true,
                min: 10,
                max: 95,
                step: 5,
                unit: '%',
                defaultValue: 70,
              },
              {
                name: 'maxReplicas',
                type: 'range',
                label: 'Max replicas',
                min: 1,
                max: 20,
                step: 1,
              },
              {
                name: 'cooldownPeriod',
                type: 'range',
                label: 'Cooldown period',
                min: 30,
                max: 600,
                step: 30,
                unit: 's',
                defaultValue: 120,
              },
            ],
          },
        },
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.review).toBeDefined();
  });

  it('should send a form review with password field', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'I need database credentials for the new environment:',
        review: {
          type: 'form',
          payload: {
            fields: [
              {
                name: 'dbHost',
                type: 'text',
                label: 'Database host',
                required: true,
              },
              {
                name: 'dbUser',
                type: 'text',
                label: 'Database user',
                required: true,
              },
              {
                name: 'dbPassword',
                type: 'password',
                label: 'Database password',
                required: true,
              },
            ],
          },
        },
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.review).toBeDefined();
  });

  it('should send a form review combining all field types', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Complete project setup — all field types:',
        review: {
          type: 'form',
          payload: {
            fields: [
              {
                name: 'projectName',
                type: 'text',
                label: 'Project name',
                required: true,
              },
              {
                name: 'contactEmail',
                type: 'email',
                label: 'Contact email',
                required: true,
              },
              { name: 'repoUrl', type: 'url', label: 'Repository URL' },
              { name: 'teamSize', type: 'number', label: 'Team size' },
              { name: 'description', type: 'textarea', label: 'Description' },
              {
                name: 'framework',
                type: 'select',
                label: 'Framework',
                options: ['Next.js', 'Remix', 'Astro'],
              },
              {
                name: 'isPublic',
                type: 'checkbox',
                label: 'Public repository',
              },
              {
                name: 'startDate',
                type: 'date',
                label: 'Start date',
                required: true,
              },
              { name: 'dailyStandup', type: 'time', label: 'Standup time' },
              { name: 'deadline', type: 'datetime', label: 'Deadline' },
              {
                name: 'priority',
                type: 'range',
                label: 'Priority',
                min: 1,
                max: 5,
                step: 1,
              },
              {
                name: 'deployToken',
                type: 'password',
                label: 'Deploy token',
              },
            ],
          },
        },
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.review).toBeDefined();
  });

  // ── Text-input review ─────────────────────────────────────
  it('should send a text-input review', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'The release notes draft is ready. Please review and provide your edits:',
        review: {
          type: 'text-input',
          payload: {
            prefill:
              '## v2.4.0 Release Notes\n\n### New Features\n- Sitemap crawler with broken-link detection\n- Auto-redirect setup for legacy URLs\n\n### Bug Fixes\n- Fixed timeout on large doc sites\n\n### Breaking Changes\n- None',
            markdown: true,
          },
        },
      })
      .expect(201);
  });

  // ── Freeform review ───────────────────────────────────────
  it('should send a freeform review', async () => {
    await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Please provide the CDN purge configuration as JSON:',
        review: {
          type: 'freeform',
          payload: {
            schema: {
              type: 'object',
              properties: {
                paths: { type: 'array', items: { type: 'string' } },
                softPurge: { type: 'boolean' },
                notify: { type: 'string' },
              },
            },
          },
        },
      })
      .expect(201);
  });

  // ── Already-completed review ──────────────────────────────
  let completedReviewMsgId: string;

  it('should send a review and immediately respond to it', async () => {
    const createRes = await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: 'Shall I enable gzip compression on the CDN?',
        review: {
          type: 'approval',
          payload: {
            options: [
              { id: 'yes', label: 'Enable' },
              { id: 'no', label: 'Skip' },
            ],
          },
        },
      })
      .expect(201);

    completedReviewMsgId = (createRes.body as MessageResponse).id;

    await request(httpServer)
      .post(`/api/messages/${completedReviewMsgId}/respond`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ response: { selectedOption: 'yes' } })
      .expect(201);
  });

  // ── Multi-file message (via Prisma) ───────────────────────
  it('should create a message with multiple attachments', async () => {
    // Look up the already-uploaded attachments to reuse their storageKeys
    const existing = await prisma.attachment.findMany({
      where: { channelId: state.agentId },
      orderBy: { createdAt: 'asc' },
      take: 4,
    });
    expect(existing.length).toBeGreaterThanOrEqual(4);

    // Create a single message with multiple attachments
    const msg = await prisma.message.create({
      data: {
        channelId: state.agentId,
        senderType: 'agent',
        senderId: state.agentId,
        text: 'Here are the project deliverables — presentation, document, data export, and a screenshot:',
        attachments: {
          create: existing.map((att) => ({
            agent: { connect: { id: state.agentId } },
            pluginType: att.pluginType,
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            storageKey: att.storageKey,
          })),
        },
      },
      include: { attachments: true },
    });

    expect(msg.attachments.length).toBe(4);
  });

  // ── Single-image message (already exists from upload, but add an explicit one with text) ──
  it('should create a message with a single image and text', async () => {
    const imageAtt = await prisma.attachment.findFirst({
      where: {
        channelId: state.agentId,
        mimeType: { startsWith: 'image/' },
      },
    });
    expect(imageAtt).toBeDefined();

    const msg = await prisma.message.create({
      data: {
        channelId: state.agentId,
        senderType: 'agent',
        senderId: state.agentId,
        text: 'Here is the updated architecture diagram:',
        attachments: {
          create: {
            agent: { connect: { id: state.agentId } },
            pluginType: imageAtt!.pluginType,
            filename: imageAtt!.filename,
            mimeType: imageAtt!.mimeType,
            size: imageAtt!.size,
            storageKey: imageAtt!.storageKey,
          },
        },
      },
      include: { attachments: true },
    });

    expect(msg.attachments.length).toBe(1);
  });

  // ── Single-video message ──────────────────────────────────
  it('should create a message with a single video', async () => {
    const videoAtt = await prisma.attachment.findFirst({
      where: {
        channelId: state.agentId,
        mimeType: { startsWith: 'video/' },
      },
    });
    expect(videoAtt).toBeDefined();

    const msg = await prisma.message.create({
      data: {
        channelId: state.agentId,
        senderType: 'agent',
        senderId: state.agentId,
        text: 'Screen recording of the bug reproduction:',
        attachments: {
          create: {
            agent: { connect: { id: state.agentId } },
            pluginType: videoAtt!.pluginType,
            filename: videoAtt!.filename,
            mimeType: videoAtt!.mimeType,
            size: videoAtt!.size,
            storageKey: videoAtt!.storageKey,
          },
        },
      },
      include: { attachments: true },
    });

    expect(msg.attachments.length).toBe(1);
  });

  // ── PDF with approval review (3 buttons) ──────────────────
  it('should create a message with a PDF and 3 response buttons', async () => {
    const pdfAtt = await prisma.attachment.findFirst({
      where: {
        channelId: state.agentId,
        mimeType: 'application/pdf',
      },
    });
    expect(pdfAtt).toBeDefined();

    const msg = await prisma.message.create({
      data: {
        channelId: state.agentId,
        senderType: 'agent',
        senderId: state.agentId,
        text: 'Here is the generated invoice for Q1. Please review and choose an action:',
        status: 'warning',
        review: {
          type: 'approval',
          status: 'pending',
          response: null,
          callback: null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          completedAt: null,
          payload: {
            options: [
              { id: 'approve', label: 'Approve & Send' },
              { id: 'revise', label: 'Request Revision' },
              { id: 'reject', label: 'Reject', style: 'danger' },
            ],
            allowComment: true,
          },
        },
        attachments: {
          create: {
            agent: { connect: { id: state.agentId } },
            pluginType: '@uax/file',
            filename: pdfAtt!.filename,
            mimeType: pdfAtt!.mimeType,
            size: pdfAtt!.size,
            storageKey: pdfAtt!.storageKey,
          },
        },
      },
      include: { attachments: true },
    });

    expect(msg.attachments.length).toBe(1);
    expect(msg.review).toBeDefined();
  });

  // ── Markdown message ──────────────────────────────────────
  it('should create a message with rich markdown content', async () => {
    const res = await request(httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${state.apiKeyRaw}`)
      .send({
        channelId: state.agentId,
        text: [
          '# Deployment Summary',
          '',
          'The deployment **completed successfully** with the following results:',
          '',
          '## Changes',
          '- Added new `UserService` module',
          '- Fixed [issue #42](https://example.com/issues/42)',
          '- Updated dependencies',
          '',
          '## Metrics',
          '| Metric | Before | After |',
          '|--------|--------|-------|',
          '| Build time | 45s | 32s |',
          '| Bundle size | 1.2MB | 980KB |',
          '| Test coverage | 78% | 85% |',
          '',
          '## Code Example',
          '```typescript',
          'const result = await deploy({',
          '  environment: "production",',
          '  dryRun: false,',
          '});',
          '```',
          '',
          '> **Note:** All services are healthy. Next deploy window: Monday 9am.',
        ].join('\n'),
        status: 'success',
      })
      .expect(201);

    const body = res.body as MessageResponse;
    expect(body.text).toContain('# Deployment Summary');
    expect(body.text).toContain('```typescript');
    expect(body.text).toContain('| Metric');
    expect(body.status).toBe('success');
  });

  // ── HTML attachment message ────────────────────────────────
  it('should create a message with an HTML file attachment', async () => {
    const htmlAtt = await prisma.attachment.findFirst({
      where: {
        channelId: state.agentId,
        mimeType: 'text/html',
      },
    });
    expect(htmlAtt).toBeDefined();

    const msg = await prisma.message.create({
      data: {
        channelId: state.agentId,
        senderType: 'agent',
        senderId: state.agentId,
        text: 'Here is the generated monthly report. Open it to view the formatted HTML preview:',
        attachments: {
          create: {
            agent: { connect: { id: state.agentId } },
            pluginType: '@uax/file',
            filename: htmlAtt!.filename,
            mimeType: htmlAtt!.mimeType,
            size: htmlAtt!.size,
            storageKey: htmlAtt!.storageKey,
          },
        },
      },
      include: { attachments: true },
    });

    expect(msg.attachments.length).toBe(1);
    expect(msg.attachments[0].mimeType).toBe('text/html');
  });

  // ── Image + multiple approval buttons + text review input ─
  it('should create a message with an image, multiple review buttons and a text input', async () => {
    const imageAtt = await prisma.attachment.findFirst({
      where: {
        channelId: state.agentId,
        mimeType: { startsWith: 'image/' },
      },
    });
    expect(imageAtt).toBeDefined();

    const msg = await prisma.message.create({
      data: {
        channelId: state.agentId,
        senderType: 'agent',
        senderId: state.agentId,
        text: 'Here is the latest design mockup. Please review the image and choose an action — you can also leave a written comment:',
        status: 'info',
        review: {
          type: 'approval',
          status: 'pending',
          response: null,
          callback: null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          completedAt: null,
          payload: {
            options: [
              { id: 'approve', label: 'Looks good, approve' },
              { id: 'revise', label: 'Needs revision' },
              { id: 'reject', label: 'Reject design', style: 'danger' },
            ],
            allowComment: true,
          },
        },
        attachments: {
          create: {
            agent: { connect: { id: state.agentId } },
            pluginType: '@uax/file',
            filename: imageAtt!.filename,
            mimeType: imageAtt!.mimeType,
            size: imageAtt!.size,
            storageKey: imageAtt!.storageKey,
          },
        },
      },
      include: { attachments: true },
    });

    expect(msg.attachments.length).toBe(1);
    expect(msg.attachments[0].mimeType).toMatch(/^image\//);
    expect(msg.review).toBeDefined();
    const payload = msg.review as {
      type: string;
      payload: { options: { id: string }[]; allowComment: boolean };
    };
    expect(payload.type).toBe('approval');
    expect(payload.payload.options).toHaveLength(3);
    expect(payload.payload.allowComment).toBe(true);
  });

  // ── User follow-up ────────────────────────────────────────
  it('should send final user messages', async () => {
    await request(httpServer)
      .post('/api/messages')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        channelId: state.agentId,
        text: 'Thanks for all the files! The diagram looks good.',
      })
      .expect(201);

    await request(httpServer)
      .post('/api/messages')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        channelId: state.agentId,
        text: 'Can you also export the data as Excel next time?',
      })
      .expect(201);
  });

  it('should have a rich message history now', async () => {
    const res = await request(httpServer)
      .get(`/api/messages?channel=${state.agentId}&limit=50`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(200);

    const body = res.body as { data: MessageResponse[] };
    // Verify we have a healthy mix of messages
    expect(body.data.length).toBeGreaterThanOrEqual(15);

    // Check reviews exist
    const withReviews = body.data.filter((m) => m.review != null);
    expect(withReviews.length).toBeGreaterThanOrEqual(5);

    // Check statuses exist
    const withStatus = body.data.filter((m) => m.status != null);
    expect(withStatus.length).toBeGreaterThanOrEqual(4);
  });
});
