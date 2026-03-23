import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { WebhookService } from '../webhooks/webhook.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { RespondReviewDto } from './dto/respond-review.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly webhooks: WebhookService,
  ) {}

  // ── Agent API ──────────────────────────────────────────────

  async createFromAgent(userId: string, dto: CreateMessageDto) {
    // Verify user owns the channel
    const agent = await this.prisma.agent.findFirst({
      where: { id: dto.channelId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');

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
        review: (dto.review as Prisma.InputJsonValue) ?? undefined,
        metadata: Object.keys(metadata).length
          ? (metadata as Prisma.InputJsonValue)
          : undefined,
      },
      include: { attachments: true },
    });

    // Tier 3: WebSocket is always active
    this.events.emitToChannel(dto.channelId, 'message:created', message);
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

  async createFromUser(userId: string, channelId: string, text: string) {
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
        text,
      },
      include: { attachments: true },
    });

    // Tier 3: WebSocket — always active
    this.events.emitToChannel(channelId, 'message:created', message);

    // Tier 1: Chat-level default webhook
    if (agent.webhookUrl) {
      void this.webhooks.dispatch(
        { url: agent.webhookUrl, method: 'POST' },
        {
          event: 'message:created',
          channelId,
          message,
        },
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
  ): Promise<{ status: 'completed' | 'timeout'; message?: unknown }> {
    const message = await this.getReviewByAgent(userId, messageId, agentId);
    const review = message.review as Record<string, unknown>;

    // Already completed — return immediately
    if (review.status === 'completed') {
      return { status: 'completed', message };
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
      responded_at: updatedReview.completed_at,
    };

    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    const messageWebhookUrl = meta.webhookUrl as string | undefined;

    if (messageWebhookUrl) {
      // Tier 2: Message-level webhook override
      void this.webhooks.dispatch(
        { url: messageWebhookUrl, method: 'POST' },
        reviewPayload,
      );
    } else if (message.agent.webhookUrl) {
      // Tier 1: Chat-level default webhook
      void this.webhooks.dispatch(
        { url: message.agent.webhookUrl, method: 'POST' },
        reviewPayload,
      );
    } else if (review.callback) {
      // Legacy: inline review callback
      void this.webhooks.dispatch(
        review.callback as { url: string; method: string },
        reviewPayload,
      );
    }

    return updated;
  }
}
