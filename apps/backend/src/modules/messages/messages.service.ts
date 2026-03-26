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
} from '@humanproxy/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PushService } from '../push/push.service';
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
  ) {}

  // ── Agent API ──────────────────────────────────────────────

  async createFromAgent(userId: string, dto: CreateMessageDto) {
    // Verify user owns the channel
    const agent = await this.prisma.agent.findFirst({
      where: { id: dto.channelId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');

    // Normalise & cap review expiration
    const review = dto.review
      ? this.normaliseReviewExpiry(dto.review as Record<string, unknown>)
      : undefined;

    // Store message-level webhookUrl in metadata if provided
    const metadata: Record<string, unknown> = {
      ...(dto.metadata ?? {}),
      ...(dto.webhookUrl ? { webhookUrl: dto.webhookUrl } : {}),
    };

    const message = await this.prisma.message.create({
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
      },
      include: { attachments: true },
    });

    // Attach orphan files if IDs were provided
    if (dto.attachmentIds?.length) {
      await this.prisma.attachment.updateMany({
        where: {
          id: { in: dto.attachmentIds },
          messageId: null,
          channelId: dto.channelId,
        },
        data: { messageId: message.id },
      });
      // Re-fetch to include the newly linked attachments
      const withAttachments = await this.prisma.message.findUnique({
        where: { id: message.id },
        include: { attachments: true },
      });
      this.events.emitToChannel(dto.channelId, 'message:created', {
        ...withAttachments,
        agentName: agent.name,
      });
      this.events.emitToUser(agent.ownerId, 'message:created', {
        ...withAttachments,
        agentName: agent.name,
      });
      void this.push.sendToUser(agent.ownerId, {
        title: agent.name,
        body: withAttachments?.text ?? 'Sent an attachment',
        channelId: dto.channelId,
      });
      return withAttachments!;
    }

    // Tier 3: WebSocket is always active
    this.events.emitToChannel(dto.channelId, 'message:created', {
      ...message,
      agentName: agent.name,
    });
    this.events.emitToUser(agent.ownerId, 'message:created', {
      ...message,
      agentName: agent.name,
    });
    void this.push.sendToUser(agent.ownerId, {
      title: agent.name,
      body: message.text ?? 'Sent an attachment',
      channelId: dto.channelId,
    });
    return message;
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
    // Verify user owns the agent
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');

    const limit = query.limit ?? 50;

    const where: Prisma.MessageWhereInput = {
      channelId: agentId,
      ...(query.search && {
        text: { contains: query.search, mode: 'insensitive' as const },
      }),
      ...(query.has_attachments && { attachments: { some: {} } }),
    };

    const messages = await this.prisma.message.findMany({
      where,
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(query.cursor && {
        cursor: { id: query.cursor },
        skip: 1,
      }),
    });

    return {
      data: messages,
      nextCursor:
        messages.length === limit ? messages[messages.length - 1]?.id : null,
    };
  }

  async findOneByAgent(userId: string, messageId: string, agentId: string) {
    // Verify user owns the agent
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId: agentId },
      include: { attachments: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  async deleteByAgent(userId: string, messageId: string, agentId: string) {
    await this.findOneByAgent(userId, messageId, agentId);
    await this.prisma.message.delete({ where: { id: messageId } });
    return { deleted: true };
  }

  // ── User API ───────────────────────────────────────────────

  async findByChannel(
    channelId: string,
    userId: string,
    query: { limit?: number; cursor?: string },
  ) {
    // Verify user owns the agent (channel)
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');

    const limit = query.limit ?? 50;
    const messages = await this.prisma.message.findMany({
      where: { channelId },
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(query.cursor && {
        cursor: { id: query.cursor },
        skip: 1,
      }),
    });

    return {
      data: messages,
      nextCursor:
        messages.length === limit ? messages[messages.length - 1]?.id : null,
    };
  }

  async createFromUser(
    userId: string,
    channelId: string,
    text?: string,
    attachmentIds?: string[],
  ) {
    // Verify user owns the agent
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');

    const message = await this.prisma.message.create({
      data: {
        channelId,
        senderType: 'user',
        senderId: userId,
        ...(text ? { text } : {}),
      },
      include: { attachments: true },
    });

    // Attach orphan files if IDs were provided
    if (attachmentIds?.length) {
      await this.prisma.attachment.updateMany({
        where: { id: { in: attachmentIds }, messageId: null, channelId },
        data: { messageId: message.id },
      });
      const withAttachments = await this.prisma.message.findUnique({
        where: { id: message.id },
        include: { attachments: true },
      });
      const final = withAttachments!;
      this.events.emitToChannel(channelId, 'message:created', final);
      this.events.emitToUser(userId, 'message:created', final);
      if (agent.webhookUrl) {
        void this.webhooks.dispatch(
          { url: agent.webhookUrl, method: 'POST' },
          { event: 'message:created', channelId, message: final },
          { userId },
        );
      }
      return final;
    }

    // Tier 3: WebSocket — always active
    this.events.emitToChannel(channelId, 'message:created', message);
    this.events.emitToUser(userId, 'message:created', message);

    // Tier 1: Chat-level default webhook
    if (agent.webhookUrl) {
      void this.webhooks.dispatch(
        { url: agent.webhookUrl, method: 'POST' },
        {
          event: 'message:created',
          channelId,
          message,
        },
        { userId },
      );
    }

    return message;
  }

  async getPendingReviews(userId: string) {
    const agents = await this.prisma.agent.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const agentIds = agents.map((a) => a.id);

    return this.prisma.message.findMany({
      where: {
        channelId: { in: agentIds },
        review: { not: Prisma.JsonNull },
        // Prisma JSON filter: review.status = 'pending'
        AND: {
          review: { path: ['status'], equals: 'pending' },
        },
      },
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Agent Review API ──────────────────────────────────────

  async getPendingReviewsByAgent(userId: string, agentId: string) {
    // Verify user owns the agent
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');

    return this.prisma.message.findMany({
      where: {
        channelId: agentId,
        review: { not: Prisma.JsonNull },
        AND: {
          review: { path: ['status'], equals: 'pending' },
        },
      },
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReviewByAgent(userId: string, messageId: string, agentId: string) {
    // Verify user owns the agent
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');

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
      return { status: 'completed', message };
    }

    // Already expired — return immediately
    if (review.status === 'expired') {
      return { status: 'expired', message };
    }

    // Check if review has expired by date but status wasn't updated yet
    if (
      review.expiresAt &&
      new Date(review.expiresAt as string) <= new Date()
    ) {
      const updated = await this.expireReview(messageId, review);
      return { status: 'expired', message: updated };
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
            resolve({ status: 'completed', message: fresh });
            return;
          }
          if (r.status === 'expired') {
            resolve({ status: 'expired', message: fresh });
            return;
          }
          // Check if review has expired by date
          if (r.expiresAt && new Date(r.expiresAt as string) <= new Date()) {
            const updated = await this.expireReview(messageId, r);
            resolve({ status: 'expired', message: updated });
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
    const message = await this.prisma.message.findUnique({
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

    const updatedReview = {
      ...review,
      status: 'completed',
      response: dto.response,
      ...(dto.annotationFileId
        ? { annotationFileId: dto.annotationFileId }
        : {}),
      completed_at: new Date().toISOString(),
    };

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { review: updatedReview as Prisma.InputJsonValue },
      include: { attachments: true },
    });

    // Tier 3: WebSocket — always active
    this.events.emitToChannel(message.channelId, 'review:responded', updated);

    // 3-tier webhook dispatch for review response:
    const reviewPayload = {
      event: 'review:responded',
      channelId: message.channelId,
      message_id: messageId,
      review_type: review.type as string,
      response: dto.response,
      ...(dto.annotationFileId
        ? { annotationFileId: dto.annotationFileId }
        : {}),
      responded_at: updatedReview.completed_at,
    };

    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    const messageWebhookUrl = meta.webhookUrl as string | undefined;

    const logCtx = { userId };

    if (messageWebhookUrl) {
      // Tier 2: Message-level webhook override
      void this.webhooks.dispatch(
        { url: messageWebhookUrl, method: 'POST' },
        reviewPayload,
        logCtx,
      );
    } else if (message.agent.webhookUrl) {
      // Tier 1: Chat-level default webhook
      void this.webhooks.dispatch(
        { url: message.agent.webhookUrl, method: 'POST' },
        reviewPayload,
        logCtx,
      );
    } else if (review.callback) {
      // Legacy: inline review callback
      void this.webhooks.dispatch(
        review.callback as { url: string; method: string },
        reviewPayload,
        logCtx,
      );
    }

    return updated;
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
    const pending = await this.prisma.message.findMany({
      where: {
        review: { not: Prisma.JsonNull },
        AND: { review: { path: ['status'], equals: 'pending' } },
      },
      select: { id: true, channelId: true, review: true },
    });

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
      expired++;
    }

    if (expired > 0) {
      this.logger.log(`Expired ${expired} review(s)`);
    }
  }
}
