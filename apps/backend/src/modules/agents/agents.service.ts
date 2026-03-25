import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../providers/s3.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import type {
  AgentStatsResponse,
  AgentStatus,
  GlobalStatsResponse,
} from '@humanproxy/shared';

/** Prisma requires DbNull for nullable JSON columns instead of plain null */
function jsonOrDbNull(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

const AGENT_SELECT = {
  id: true,
  name: true,
  description: true,
  avatarUrl: true,
  webhookUrl: true,
  webhookHeaders: true,
  webhookAuth: true,
  status: true,
  statusMessage: true,
  statusSince: true,
  lastActiveAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async findAllByOwner(ownerId: string) {
    return this.prisma.agent.findMany({
      where: { ownerId },
      select: AGENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, ownerId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, ownerId },
      select: AGENT_SELECT,
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async create(ownerId: string, dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        ownerId,
        name: dto.name,
        description: dto.description,
        avatarUrl: dto.avatarUrl,
        webhookUrl: dto.webhookUrl,
      },
      select: AGENT_SELECT,
    });
  }

  async update(id: string, ownerId: string, dto: UpdateAgentDto) {
    await this.findById(id, ownerId);
    return this.prisma.agent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
        ...(dto.webhookHeaders !== undefined && {
          webhookHeaders: jsonOrDbNull(dto.webhookHeaders),
        }),
        ...(dto.webhookAuth !== undefined && {
          webhookAuth: jsonOrDbNull(dto.webhookAuth),
        }),
      },
      select: AGENT_SELECT,
    });
  }

  async remove(id: string, ownerId: string) {
    await this.findById(id, ownerId);
    await this.prisma.agent.delete({ where: { id } });
    return { deleted: true };
  }

  async pingStatus(
    agentId: string,
    ownerId: string,
    status: string,
    message?: string,
  ) {
    await this.findById(agentId, ownerId);

    const now = new Date();

    // Update agent's current status + write history entry in parallel
    const [agent] = await Promise.all([
      this.prisma.agent.update({
        where: { id: agentId },
        data: {
          status,
          statusMessage: message ?? null,
          statusSince: now,
          lastActiveAt: now,
        },
        select: AGENT_SELECT,
      }),
      this.prisma.agentStatusHistory.create({
        data: {
          agentId,
          status,
          message: message ?? null,
        },
      }),
    ]);

    return agent;
  }

  async getStats(
    agentId: string,
    ownerId: string,
  ): Promise<AgentStatsResponse> {
    await this.findById(agentId, ownerId);

    const [messageStats, logStats, statusHistory] = await Promise.all([
      // Count messages by sender type
      this.prisma.message.groupBy({
        by: ['senderType'],
        where: { channelId: agentId },
        _count: true,
      }),
      // Count API logs by status code range (success vs error) — per agent
      this.prisma.$queryRaw<
        { is_success: boolean; count: bigint }[]
      >`SELECT status_code < 400 AS is_success, COUNT(*)::bigint AS count
        FROM api_logs
        WHERE user_id = ${ownerId}
          AND path LIKE '/api/v1/%'
          AND (
            request_body->>'channelId' = ${agentId}
            OR request_body->>'agentId' = ${agentId}
          )
        GROUP BY is_success`,
      // Last 100 status history entries for the uptime chart
      this.prisma.agentStatusHistory.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          agentId: true,
          status: true,
          message: true,
          createdAt: true,
        },
      }),
    ]);

    let totalInbound = 0;
    let totalOutbound = 0;
    for (const row of messageStats) {
      if (row.senderType === 'agent') totalInbound += row._count;
      else totalOutbound += row._count;
    }

    let successRequests = 0;
    let errorRequests = 0;
    for (const row of logStats) {
      const count = Number(row.count);
      if (row.is_success) successRequests = count;
      else errorRequests = count;
    }

    return {
      totalMessages: totalInbound + totalOutbound,
      totalInbound,
      totalOutbound,
      successRequests,
      errorRequests,
      statusHistory: statusHistory.map((h) => ({
        ...h,
        status: h.status as AgentStatus,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }

  async getGlobalStats(ownerId: string): Promise<GlobalStatsResponse> {
    const [agents, messageCount, logStats] = await Promise.all([
      this.prisma.agent.findMany({
        where: { ownerId },
        select: { id: true, status: true },
      }),
      this.prisma.message.count({
        where: { agent: { ownerId } },
      }),
      this.prisma.$queryRaw<
        { is_success: boolean; count: bigint }[]
      >`SELECT status_code < 400 AS is_success, COUNT(*)::bigint AS count
        FROM api_logs
        WHERE user_id = ${ownerId}
          AND path LIKE '/api/v1/%'
        GROUP BY is_success`,
    ]);

    let successRequests = 0;
    let errorRequests = 0;
    for (const row of logStats) {
      const count = Number(row.count);
      if (row.is_success) successRequests = count;
      else errorRequests = count;
    }

    const activeAgents = agents.filter((a) => a.status !== 'offline').length;

    return {
      totalAgents: agents.length,
      activeAgents,
      totalMessages: messageCount,
      successRequests,
      errorRequests,
    };
  }

  async uploadAvatar(
    id: string,
    ownerId: string,
    buffer: Buffer,
    mimeType: string,
  ) {
    const agent = await this.findById(id, ownerId);

    // Delete old avatar from S3 if exists
    if (agent.avatarUrl) {
      await this.s3.delete(agent.avatarUrl).catch(() => {});
    }

    // Use unique key per upload for cache busting
    const storageKey = `avatars/${id}/${Date.now()}`;
    await this.s3.upload(storageKey, buffer, mimeType);

    return this.prisma.agent.update({
      where: { id },
      data: { avatarUrl: storageKey },
      select: AGENT_SELECT,
    });
  }

  async getAvatarStream(id: string, ownerId: string) {
    const agent = await this.findById(id, ownerId);
    if (!agent.avatarUrl) throw new NotFoundException('No avatar set');

    const response = await this.s3.getStream(agent.avatarUrl);
    return response;
  }

  async removeAvatar(id: string, ownerId: string) {
    const agent = await this.findById(id, ownerId);
    if (!agent.avatarUrl) return agent;

    await this.s3.delete(agent.avatarUrl);

    return this.prisma.agent.update({
      where: { id },
      data: { avatarUrl: null },
      select: AGENT_SELECT,
    });
  }
}
