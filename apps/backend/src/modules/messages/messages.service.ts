import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import {
  MAX_REVIEW_DURATION_SECONDS,
  DEFAULT_REVIEW_DURATION_SECONDS,
} from '@placet/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import {
  WebhooksService,
  type WebhookCallback,
} from '../webhooks/webhooks.service';
import { PushService } from '../push/push.service';
import { FilesService } from '../files/files.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { RespondReviewDto } from './dto/respond-review.dto';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly webhooks: WebhooksService,
    private readonly push: PushService,
    private readonly files: FilesService,
  ) {}

  // ── Private helpers ────────────────────────────────────────

  /** Max size for inline text content (64 KB). Larger files require download. */
  private static readonly MAX_INLINE_TEXT_SIZE = 64 * 1024;

  private static readonly REDACTED_VALUE = '***REDACTED***';

  /**
   * Redact password field values from a form review response.
   * Looks up form field definitions in the review payload to identify
   * fields with `type: 'password'` and replaces their values.
   */
  private redactPasswordFields(
    review: Record<string, unknown>,
    response: Record<string, unknown>,
  ): Record<string, unknown> {
    if (review.type !== 'form') return response;
    const payload = review.payload as
      | { fields?: Array<{ name: string; type: string }> }
      | undefined;
    if (!payload?.fields) return response;
    const passwordKeys = new Set(
      payload.fields.filter((f) => f.type === 'password').map((f) => f.name),
    );
    if (passwordKeys.size === 0) return response;
    const redacted = { ...response };
    for (const key of passwordKeys) {
      if (key in redacted && redacted[key]) {
        redacted[key] = MessagesService.REDACTED_VALUE;
      }
    }
    return redacted;
  }

  /** MIME types whose content is returned inline in API responses. */
  private static isInlineTextMime(mimeType: string): boolean {
    return (
      mimeType === 'text/markdown' ||
      mimeType === 'text/plain' ||
      mimeType === 'text/html' ||
      mimeType === 'text/csv'
    );
  }

  /**
   * Enriches text-based attachments with inline `textContent` so agents
   * don't need a separate download call for small text files.
   */
  private async enrichTextAttachments<
    T extends {
      attachments?: Array<{
        mimeType: string;
        size: bigint | number;
        storageKey: string;
      }>;
    },
  >(message: T): Promise<T> {
    if (!message.attachments?.length) return message;
    const enriched = await Promise.all(
      message.attachments.map(async (att) => {
        if (
          MessagesService.isInlineTextMime(att.mimeType) &&
          Number(att.size) <= MessagesService.MAX_INLINE_TEXT_SIZE
        ) {
          const textContent = await this.files.getTextContent(att.storageKey);
          return { ...att, textContent };
        }
        return att;
      }),
    );
    return { ...message, attachments: enriched };
  }

  private async assertOwnership(agentId: string, userId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');
    return agent;
  }

  private async paginateMessages(
    where: Prisma.MessageWhereInput,
    opts: { limit?: number; cursor?: string },
  ) {
    const limit = Math.min(opts.limit ?? 50, 100);
    const messages = await this.prisma.message.findMany({
      where,
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(opts.cursor && {
        cursor: { id: opts.cursor },
        skip: 1,
      }),
    });

    return {
      data: messages.map((m) => this.sanitizeMessageForClient(m)),
      nextCursor:
        messages.length === limit ? messages[messages.length - 1]?.id : null,
    };
  }

  /**
   * Redact password field values from a message's review response before
   * sending to the client (REST API). The raw values remain in the database
   * so that webhook delivery to agents can include the real value.
   */
  private sanitizeMessageForClient<T extends { review?: unknown }>(msg: T): T {
    const review = msg.review as Record<string, unknown> | null | undefined;
    if (!review || review.type !== 'form') return msg;
    const response = review.response as Record<string, unknown> | undefined;
    if (!response) return msg;
    const redacted = this.redactPasswordFields(review, response);
    if (redacted === response) return msg; // no password fields
    return {
      ...msg,
      review: { ...review, response: redacted },
    };
  }

  private async linkAttachments(
    messageId: string,
    attachmentIds: string[],
    channelId: string,
  ) {
    await this.prisma.attachment.updateMany({
      where: {
        id: { in: attachmentIds },
        messageId: null,
        channelId,
      },
      data: { messageId },
    });
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: true },
    });
    return msg!;
  }

  /** Build a WebhookCallback with the agent's configured auth/headers. */
  private buildAgentWebhook(
    agent: {
      webhookUrl?: string | null;
      webhookHeaders?: unknown;
      webhookAuth?: unknown;
    },
    urlOverride?: string,
  ): WebhookCallback | null {
    const url = urlOverride ?? agent.webhookUrl;
    if (!url) return null;
    const headers = (agent.webhookHeaders ?? undefined) as
      | Record<string, string>
      | undefined;
    const rawAuth = agent.webhookAuth as
      | Record<string, unknown>
      | null
      | undefined;
    const auth =
      rawAuth && rawAuth.username && rawAuth.password
        ? {
            type: 'basic' as const,
            username: rawAuth.username as string,
            password: rawAuth.password as string,
          }
        : undefined;
    return {
      url,
      method: 'POST',
      ...(headers ? { headers } : {}),
      ...(auth ? { auth } : {}),
    };
  }

  /**
   * Dispatch webhook and update the message's deliveryStatus accordingly.
   * Emits a `message:delivery` WS event so the frontend can show checkmarks.
   */
  private async dispatchAndTrackDelivery(
    messageId: string,
    channelId: string,
    callback: WebhookCallback,
    payload: Record<string, unknown>,
    logCtx: { userId: string },
  ) {
    const result = await this.webhooks.dispatch(callback, payload, logCtx);
    const deliveryStatus = result.success
      ? 'webhook_delivered'
      : 'webhook_failed';

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deliveryStatus },
    });

    this.events.emitToChannel(channelId, 'message:delivery', {
      messageId,
      deliveryStatus,
    });
  }

  // ── Agent API ──────────────────────────────────────────────

  async createFromAgent(userId: string, dto: CreateMessageDto) {
    const agent = await this.assertOwnership(dto.channelId, userId);

    // ── Iteration chain handling ──
    let iterationGroupId: string | undefined;
    let iteration: number | undefined;
    let iterationTarget:
      | { id: string; iterationGroupId: string | null }
      | undefined;

    if (dto.iterationOf) {
      const target = await this.prisma.message.findFirst({
        where: { id: dto.iterationOf, channelId: dto.channelId },
      });
      if (!target) {
        throw new BadRequestException(
          'iterationOf target does not exist in this channel',
        );
      }
      const targetReview = target.review as Record<string, unknown> | null;
      if (
        !targetReview ||
        (targetReview.status !== 'completed' &&
          targetReview.status !== 'expired')
      ) {
        throw new BadRequestException(
          'iterationOf target must have a completed or expired review',
        );
      }

      iterationTarget = {
        id: target.id,
        iterationGroupId: target.iterationGroupId,
      };
    }

    // Normalise & cap review expiration
    const review = dto.review
      ? this.normaliseReviewExpiry(dto.review as Record<string, unknown>)
      : undefined;

    // Store message-level webhookUrl in metadata if provided
    const metadata: Record<string, unknown> = {
      ...(dto.metadata ?? {}),
      ...(dto.webhookUrl ? { webhookUrl: dto.webhookUrl } : {}),
    };

    // Auto-set metadata.plugin from review.payload.plugin so the frontend
    // renders via PluginRenderer instead of the generic ReviewCard fallback
    if (
      review &&
      review.type === 'freeform' &&
      typeof (review.payload as Record<string, unknown>)?.plugin === 'string' &&
      !metadata.plugin
    ) {
      metadata.plugin = (review.payload as Record<string, unknown>).plugin;
    }

    // ── Store inline textAttachments as files and merge into attachmentIds ──
    const allAttachmentIds = [...(dto.attachmentIds ?? [])];
    if (dto.textAttachments?.length) {
      for (const ta of dto.textAttachments) {
        const att = await this.files.storeText(
          ta.content,
          ta.filename ?? 'content.md',
          ta.mimeType ?? 'text/markdown',
          dto.channelId,
        );
        allAttachmentIds.push(att.id);
      }
    }

    // ── Create message (with atomic iteration numbering if part of a chain) ──
    const message = await this.prisma.$transaction(async (tx) => {
      if (iterationTarget) {
        iterationGroupId =
          (iterationTarget.iterationGroupId as string) ?? iterationTarget.id;

        const maxResult = await tx.message.aggregate({
          where: { iterationGroupId },
          _max: { iteration: true },
        });
        iteration = (maxResult._max.iteration ?? 1) + 1;
      }

      const created = await tx.message.create({
        data: {
          channelId: dto.channelId,
          senderType: 'agent',
          senderId: dto.channelId,
          text: dto.text,
          status: dto.status,
          review: review as Prisma.InputJsonValue | undefined,
          metadata: Object.keys(metadata).length
            ? (metadata as Prisma.InputJsonValue)
            : undefined,
          ...(iterationGroupId != null ? { iterationGroupId, iteration } : {}),
        },
        include: { attachments: true },
      });

      // Backfill root as iteration 1 when first follow-up is created
      if (iterationTarget && iteration === 2) {
        await tx.message.update({
          where: { id: iterationTarget.id },
          data: { iterationGroupId: iterationGroupId!, iteration: 1 },
        });
      }

      return created;
    });

    // Attach orphan files if IDs were provided
    const final = allAttachmentIds.length
      ? await this.linkAttachments(message.id, allAttachmentIds, dto.channelId)
      : message;

    // Emit events
    const eventData = { ...final, agentName: agent.name };
    this.events.emitToChannel(dto.channelId, 'message:created', eventData);
    this.events.emitToUser(agent.ownerId, 'message:created', eventData);
    void this.push.sendToUser(agent.ownerId, {
      title: agent.name,
      body: final.text ?? 'Sent an attachment',
      channelId: dto.channelId,
    });

    // Enrich text attachments with inline content for agent API responses
    return this.enrichTextAttachments(final);
  }

  async findByAgent(
    userId: string,
    agentId: string,
    query: {
      limit?: number;
      cursor?: string;
      search?: string;
      has_attachments?: boolean;
    },
  ) {
    await this.assertOwnership(agentId, userId);

    const where: Prisma.MessageWhereInput = {
      channelId: agentId,
      ...(query.search && {
        text: { contains: query.search, mode: 'insensitive' as const },
      }),
      ...(query.has_attachments && { attachments: { some: {} } }),
    };

    return this.paginateMessages(where, query);
  }

  async findOneByAgent(userId: string, messageId: string, agentId: string) {
    await this.assertOwnership(agentId, userId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId: agentId },
      include: { attachments: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  async deleteByAgent(userId: string, messageId: string, agentId: string) {
    const message = await this.findOneByAgent(userId, messageId, agentId);

    // Prevent deletion of root messages that have follow-up iterations
    if (message.iterationGroupId || message.iteration) {
      const groupId = message.iterationGroupId ?? message.id;
      const hasFollowUps = await this.prisma.message.count({
        where: { iterationGroupId: groupId, id: { not: messageId } },
      });
      if (hasFollowUps > 0) {
        throw new BadRequestException(
          'Cannot delete a message that is part of an iteration chain with other messages',
        );
      }
    }

    await this.prisma.message.delete({ where: { id: messageId } });
    return { deleted: true };
  }

  /** Retrieve all messages in an iteration chain, sorted by iteration number. */
  async getIterationChain(
    messageId: string,
    channelId: string,
    userId: string,
  ) {
    await this.assertOwnership(channelId, userId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
    });
    if (!message) throw new NotFoundException('Message not found');

    const groupId = message.iterationGroupId ?? message.id;

    const iterations = await this.prisma.message.findMany({
      where: {
        OR: [{ iterationGroupId: groupId }, { id: groupId }],
      },
      include: { attachments: true },
      orderBy: { iteration: 'asc' },
    });

    return { groupId, iterations };
  }

  // ── User API ───────────────────────────────────────────────

  async findByChannel(
    channelId: string,
    userId: string,
    query: { limit?: number; cursor?: string },
  ) {
    await this.assertOwnership(channelId, userId);
    return this.paginateMessages({ channelId }, query);
  }

  async createFromUser(
    userId: string,
    channelId: string,
    text?: string,
    attachmentIds?: string[],
    clientId?: string,
  ) {
    const agent = await this.assertOwnership(channelId, userId);

    const message = await this.prisma.message.create({
      data: {
        channelId,
        senderType: 'user',
        senderId: userId,
        ...(text ? { text } : {}),
        ...(clientId ? { metadata: { clientId } } : {}),
      },
      include: { attachments: true },
    });

    // Attach orphan files if IDs were provided
    const final = attachmentIds?.length
      ? await this.linkAttachments(message.id, attachmentIds, channelId)
      : message;

    // Emit events
    this.events.emitToChannel(channelId, 'message:created', final);
    this.events.emitToUser(userId, 'message:created', final);

    // Chat-level webhook with auth/headers
    const callback = this.buildAgentWebhook(agent);
    if (callback) {
      void this.dispatchAndTrackDelivery(
        final.id,
        channelId,
        callback,
        { event: 'message:created', channelId, message: final },
        { userId },
      );
    }

    return final;
  }

  async findById(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: true, agent: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.agent.ownerId !== userId) {
      throw new ForbiddenException('Not your agent');
    }
    // Strip sensitive agent credentials before returning to the client
    const {
      webhookAuth: _wa,
      webhookHeaders: _wh,
      webhookUrl: _wu,
      ...safeAgent
    } = message.agent;
    return this.sanitizeMessageForClient({ ...message, agent: safeAgent });
  }

  async getReviews(userId: string, status?: string, channelId?: string) {
    // If channel specified, verify ownership
    if (channelId) {
      await this.assertOwnership(channelId, userId);
    }

    const agents = channelId
      ? [{ id: channelId }]
      : await this.prisma.agent.findMany({
          where: { ownerId: userId },
          select: { id: true },
        });
    const agentIds = agents.map((a) => a.id);

    const messages = await this.prisma.message.findMany({
      where: {
        channelId: { in: agentIds },
        review: { not: Prisma.JsonNull },
      },
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
    });

    if (status && status !== 'all') {
      return messages
        .filter((m) => (m.review as Record<string, unknown>)?.status === status)
        .map((m) => this.sanitizeMessageForClient(m));
    }
    return messages.map((m) => this.sanitizeMessageForClient(m));
  }

  /** @deprecated Use getReviews instead */
  async getPendingReviews(userId: string) {
    return this.getReviews(userId, 'pending');
  }

  // ── Agent Review API ──────────────────────────────────────

  async getPendingReviewsByAgent(userId: string, agentId: string) {
    await this.assertOwnership(agentId, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        channelId: agentId,
        review: { not: Prisma.JsonNull },
      },
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
    });

    return messages.filter(
      (m) => (m.review as Record<string, unknown>)?.status === 'pending',
    );
  }

  async getReviewByAgent(userId: string, messageId: string, agentId: string) {
    await this.assertOwnership(agentId, userId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId: agentId },
      include: { attachments: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (!message.review)
      throw new NotFoundException('No review on this message');
    return message;
  }

  async waitForReviewResponse(
    userId: string,
    messageId: string,
    agentId: string,
    timeoutMs = 30000,
  ): Promise<{
    status: 'completed' | 'expired' | 'timeout';
    message?: unknown;
  }> {
    const message = await this.getReviewByAgent(userId, messageId, agentId);
    const review = message.review as Record<string, unknown>;

    // Already completed — return immediately
    if (review.status === 'completed') {
      return {
        status: 'completed',
        message: await this.enrichTextAttachments(message),
      };
    }

    // Already expired — return immediately
    if (review.status === 'expired') {
      return {
        status: 'expired',
        message: await this.enrichTextAttachments(message),
      };
    }

    // Check if review has expired by date but status wasn't updated yet
    if (
      review.expiresAt &&
      new Date(review.expiresAt as string) <= new Date()
    ) {
      const updated = await this.expireReview(messageId, review);
      return {
        status: 'expired',
        message: await this.enrichTextAttachments(updated),
      };
    }

    // Long-poll: check periodically until timeout
    const pollInterval = 2000;
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve) => {
      const check = async () => {
        if (Date.now() >= deadline) {
          resolve({ status: 'timeout' });
          return;
        }

        const fresh = await this.prisma.message.findFirst({
          where: { id: messageId, channelId: agentId },
          include: { attachments: true },
        });

        if (fresh?.review) {
          const r = fresh.review as Record<string, unknown>;
          if (r.status === 'completed') {
            resolve({
              status: 'completed',
              message: await this.enrichTextAttachments(fresh),
            });
            return;
          }
          if (r.status === 'expired') {
            resolve({
              status: 'expired',
              message: await this.enrichTextAttachments(fresh),
            });
            return;
          }
          // Check if review has expired by date
          if (r.expiresAt && new Date(r.expiresAt as string) <= new Date()) {
            const updated = await this.expireReview(messageId, r);
            resolve({
              status: 'expired',
              message: await this.enrichTextAttachments(updated),
            });
            return;
          }
        }

        setTimeout(() => void check(), pollInterval);
      };

      void check();
    });
  }

  // ── User Review Response ─────────────────────────────────

  async respondToReview(
    messageId: string,
    userId: string,
    dto: RespondReviewDto,
  ) {
    // Wrap in interactive transaction to prevent race conditions (parallel tabs)
    const updated = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findUnique({
        where: { id: messageId },
        include: { agent: true },
      });
      if (!message) throw new NotFoundException('Message not found');
      if (message.agent.ownerId !== userId) {
        throw new ForbiddenException('Not your agent');
      }
      if (!message.review) {
        throw new NotFoundException('No review on this message');
      }

      const review = message.review as Record<string, unknown>;
      if (review.status !== 'pending') {
        throw new ForbiddenException('Review already responded');
      }

      const newStatus = 'completed';
      const updatedReview = {
        ...review,
        status: newStatus,
        response: dto.response,
        ...(dto.modifiedFileIds && Object.keys(dto.modifiedFileIds).length
          ? { modifiedFileIds: dto.modifiedFileIds }
          : {}),
        ...(dto.feedback ? { feedback: dto.feedback } : {}),
        completedAt: new Date().toISOString(),
      };

      return tx.message.update({
        where: { id: messageId },
        data: { review: updatedReview as Prisma.InputJsonValue },
        include: { attachments: true, agent: true },
      });
    });

    const review = updated.review as Record<string, unknown>;

    // Tier 3: WebSocket — always active
    this.events.emitToChannel(updated.channelId, 'review:responded', updated);

    // 3-tier webhook dispatch for review response:
    const webhookEvent = 'review:responded';

    const reviewPayload: Record<string, unknown> = {
      event: webhookEvent,
      channelId: updated.channelId,
      message_id: messageId,
      review_type: review.type as string,
      response: dto.response,
      ...(dto.modifiedFileIds && Object.keys(dto.modifiedFileIds).length
        ? { modifiedFileIds: dto.modifiedFileIds }
        : {}),
      ...(dto.feedback ? { feedback: dto.feedback } : {}),
      responded_at: review.completedAt,
    };

    // Add iteration context if message is part of a chain
    if (updated.iterationGroupId) {
      reviewPayload.iterationGroupId = updated.iterationGroupId;
      reviewPayload.iteration = updated.iteration;
    }

    const meta = (updated.metadata ?? {}) as Record<string, unknown>;
    const messageWebhookUrl = meta.webhookUrl as string | undefined;

    const logCtx = { userId };

    // Resolve callback: message-level override → agent-level → legacy inline
    const callback = messageWebhookUrl
      ? (this.buildAgentWebhook(updated.agent, messageWebhookUrl) ??
        ({ url: messageWebhookUrl, method: 'POST' } as WebhookCallback))
      : (this.buildAgentWebhook(updated.agent) ??
        (review.callback ? (review.callback as WebhookCallback) : null));

    if (callback) {
      void this.dispatchAndTrackDelivery(
        messageId,
        updated.channelId,
        callback,
        reviewPayload,
        logCtx,
      );
    }

    return updated;
  }

  /** Retry webhook delivery for a message whose webhook previously failed. */
  async retryWebhookDelivery(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { agent: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.agent.ownerId !== userId) {
      throw new ForbiddenException('Not your agent');
    }

    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    const messageWebhookUrl = meta.webhookUrl as string | undefined;
    const review = message.review as Record<string, unknown> | null;

    // For review messages → re-send the review:responded payload
    if (review && review.status === 'completed') {
      const reviewPayload: Record<string, unknown> = {
        event: 'review:responded',
        channelId: message.channelId,
        message_id: messageId,
        review_type: review.type as string,
        response: review.response,
        responded_at: review.completedAt,
        ...(review.feedback ? { feedback: review.feedback } : {}),
        ...(review.modifiedFileIds
          ? { modifiedFileIds: review.modifiedFileIds }
          : {}),
      };

      if (message.iterationGroupId) {
        reviewPayload.iterationGroupId = message.iterationGroupId;
        reviewPayload.iteration = message.iteration;
      }

      const callback = messageWebhookUrl
        ? (this.buildAgentWebhook(message.agent, messageWebhookUrl) ??
          ({ url: messageWebhookUrl, method: 'POST' } as WebhookCallback))
        : (this.buildAgentWebhook(message.agent) ??
          (review.callback ? (review.callback as WebhookCallback) : null));

      if (!callback) {
        throw new BadRequestException('No webhook configured for this message');
      }

      await this.dispatchAndTrackDelivery(
        messageId,
        message.channelId,
        callback,
        reviewPayload,
        { userId },
      );
      return { retried: true };
    }

    // For user messages → re-send message:created payload
    if (message.senderType === 'user') {
      const callback = this.buildAgentWebhook(message.agent);
      if (!callback) {
        throw new BadRequestException('No webhook configured for this agent');
      }

      await this.dispatchAndTrackDelivery(
        messageId,
        message.channelId,
        callback,
        { event: 'message:created', channelId: message.channelId, message },
        { userId },
      );
      return { retried: true };
    }

    throw new BadRequestException('Cannot retry delivery for this message');
  }

  /** Agent acknowledges receipt of a message via API. */
  async acknowledgeMessage(userId: string, messageId: string, agentId: string) {
    await this.assertOwnership(agentId, userId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId: agentId },
    });
    if (!message) throw new NotFoundException('Message not found');

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deliveryStatus: 'agent_received' },
    });

    this.events.emitToChannel(agentId, 'message:delivery', {
      messageId,
      deliveryStatus: 'agent_received',
    });

    return { acknowledged: true };
  }

  // ── Review Expiry ─────────────────────────────────────────

  /**
   * Resolves expiresAt from expiresInSeconds (if given), applies the default
   * duration when neither is set, and caps the result at MAX_REVIEW_DURATION.
   * Returns a clean review object without the convenience field.
   */
  private normaliseReviewExpiry(
    review: Record<string, unknown>,
  ): Record<string, unknown> {
    const maxMs = MAX_REVIEW_DURATION_SECONDS * 1_000;
    const now = Date.now();

    let expiresAt: number | undefined;

    if (review.expiresInSeconds != null) {
      const seconds = Number(review.expiresInSeconds);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new BadRequestException(
          'expiresInSeconds must be a positive integer',
        );
      }
      expiresAt = now + seconds * 1_000;
    } else if (review.expiresAt) {
      const parsed = new Date(review.expiresAt as string).getTime();
      if (Number.isNaN(parsed)) {
        throw new BadRequestException(
          'expiresAt must be a valid ISO date string',
        );
      }
      expiresAt = parsed;
    } else {
      // Default expiration
      expiresAt = now + DEFAULT_REVIEW_DURATION_SECONDS * 1_000;
    }

    // Cap at max duration
    const maxExpiresAt = now + maxMs;
    if (expiresAt > maxExpiresAt) {
      expiresAt = maxExpiresAt;
    }

    // Don't allow expiration in the past
    if (expiresAt <= now) {
      throw new BadRequestException('Review expiration must be in the future');
    }

    const rest = { ...review };
    delete rest.expiresInSeconds;
    return {
      ...rest,
      status: 'pending',
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  private async expireReview(
    messageId: string,
    review: Record<string, unknown>,
  ) {
    const updatedReview = {
      ...review,
      status: 'expired',
    };

    return this.prisma.message.update({
      where: { id: messageId },
      data: { review: updatedReview as Prisma.InputJsonValue },
      include: { attachments: true },
    });
  }

  /** Runs every 60 seconds — marks reviews as expired whose expiresAt has passed. */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleReviewExpiry() {
    const allWithReview = await this.prisma.message.findMany({
      where: {
        review: { not: Prisma.JsonNull },
      },
      select: {
        id: true,
        channelId: true,
        review: true,
        metadata: true,
        agent: {
          select: { webhookUrl: true, webhookHeaders: true, webhookAuth: true },
        },
      },
    });

    const pending = allWithReview.filter(
      (m) => (m.review as Record<string, unknown>)?.status === 'pending',
    );

    const now = new Date();
    let expired = 0;

    for (const msg of pending) {
      const review = msg.review as Record<string, unknown>;
      if (!review.expiresAt) continue;

      const expiresAt = new Date(review.expiresAt as string);
      if (expiresAt > now) continue;

      await this.expireReview(msg.id, review);
      this.events.emitToChannel(msg.channelId, 'review:expired', {
        messageId: msg.id,
      });

      // Notify via webhook that review expired
      const meta = (msg.metadata ?? {}) as Record<string, unknown>;
      const messageWebhookUrl = meta.webhookUrl as string | undefined;

      const callback = messageWebhookUrl
        ? (this.buildAgentWebhook(msg.agent, messageWebhookUrl) ??
          ({ url: messageWebhookUrl, method: 'POST' } as WebhookCallback))
        : (this.buildAgentWebhook(msg.agent) ??
          (review.callback ? (review.callback as WebhookCallback) : null));

      if (callback) {
        void this.webhooks
          .dispatch(callback, {
            event: 'review:expired',
            channelId: msg.channelId,
            message_id: msg.id,
            review_type: review.type as string,
            expired_at: now.toISOString(),
          })
          .catch(() => {}); // best-effort
      }

      expired++;
    }

    if (expired > 0) {
      this.logger.log(`Expired ${expired} review(s)`);
    }
  }
}
