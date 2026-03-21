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

  async createFromAgent(agentId: string, dto: CreateMessageDto) {
    const message = await this.prisma.message.create({
      data: {
        channelId: agentId,
        senderType: 'agent',
        senderId: agentId,
        text: dto.text,
        status: dto.status,
        review: (dto.review as Prisma.InputJsonValue) ?? undefined,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? undefined,
      },
      include: { attachments: true },
    });

    this.events.emitToChannel(agentId, 'message:created', message);
    return message;
  }

  async findByAgent(
    agentId: string,
    query: {
      limit?: number;
      cursor?: string;
      search?: string;
      has_attachments?: boolean;
    },
  ) {
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

  async findOneByAgent(messageId: string, agentId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId: agentId },
      include: { attachments: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  async deleteByAgent(messageId: string, agentId: string) {
    await this.findOneByAgent(messageId, agentId);
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

    this.events.emitToChannel(channelId, 'message:created', message);
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

  async getPendingReviewsByAgent(agentId: string) {
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

  async getReviewByAgent(messageId: string, agentId: string) {
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
    messageId: string,
    agentId: string,
    timeoutMs = 30000,
  ): Promise<{ status: 'completed' | 'timeout'; message?: unknown }> {
    const message = await this.getReviewByAgent(messageId, agentId);
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

    this.events.emitToChannel(message.channelId, 'review:responded', updated);

    // Dispatch webhook callback if configured
    if (review.callback) {
      void this.webhooks.dispatch(
        review.callback as { url: string; method: string },
        {
          message_id: messageId,
          review_type: review.type as string,
          response: dto.response,
          responded_at: updatedReview.completed_at,
        },
      );
    }

    return updated;
  }
}
