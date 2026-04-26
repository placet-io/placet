import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../providers/s3.service';
import { AgentRosterEvents } from './agent-roster-events';
import { CreateAgentDto } from './dto/create-agent.dto';
import type {
  AgentStatsResponse,
  AgentStatus,
  GlobalStatsResponse,
  UpdateAgentRequest,
} from '@placet/shared';

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
  commands: true,
  tag: true,
  managementUrl: true,
  managementApiKey: true,
  isSubagent: true,
  parentAgentId: true,
  createdAt: true,
} as const;

/** Mask sensitive credential fields in webhookAuth before sending to clients */
function maskWebhookAuth<T extends { webhookAuth?: unknown }>(agent: T): T {
  if (
    !agent.webhookAuth ||
    typeof agent.webhookAuth !== 'object' ||
    agent.webhookAuth === null
  )
    return agent;
  const auth = { ...(agent.webhookAuth as Record<string, unknown>) };
  if (auth.password) auth.password = '***';
  if (auth.token) auth.token = '***';
  return Object.assign({}, agent, { webhookAuth: auth }) as T;
}

/** Replace the management API key with `***` so it never leaves the server. */
function maskManagementKey<T extends { managementApiKey?: unknown }>(
  agent: T,
): T {
  if (!agent.managementApiKey) return agent;
  return Object.assign({}, agent, { managementApiKey: '***' }) as T;
}

function maskAgent<
  T extends { webhookAuth?: unknown; managementApiKey?: unknown },
>(agent: T): T {
  return maskManagementKey(maskWebhookAuth(agent));
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly rosterEvents: AgentRosterEvents,
  ) {}

  async findAllByOwnerSimple(ownerId: string) {
    const agents = await this.prisma.agent.findMany({
      where: { ownerId },
      select: AGENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return agents.map((a) => maskAgent(a));
  }

  async findAllByOwner(ownerId: string) {
    const agents = await this.prisma.agent.findMany({
      where: { ownerId },
      select: {
        ...AGENT_SELECT,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true, createdAt: true },
        },
        channelReads: {
          where: { userId: ownerId },
          select: { lastReadAt: true },
        },
        _count: {
          select: { messages: { where: { senderType: 'agent' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Compute unread counts efficiently: count messages after lastReadAt
    const agentIds = agents
      .filter((a) => a.channelReads[0]?.lastReadAt)
      .map((a) => a.id);

    const unreadCounts =
      agentIds.length > 0
        ? await this.prisma.$queryRaw<{ channel_id: string; count: bigint }[]>`
            SELECT m.channel_id, COUNT(*) AS count
            FROM messages m
            JOIN channel_reads cr ON cr.channel_id = m.channel_id AND cr.user_id = ${ownerId}
            WHERE m.channel_id IN (${Prisma.join(agentIds)})
              AND m.created_at > cr.last_read_at
              AND m.sender_type = 'agent'
            GROUP BY m.channel_id`
        : [];

    const unreadMap = new Map(
      unreadCounts.map((r) => [r.channel_id, Number(r.count)]),
    );

    // For agents without any channelRead entry, all messages are unread
    const noReadAgents = agents.filter((a) => !a.channelReads[0]);
    const noReadMap = new Map(
      noReadAgents.map((a) => [a.id, a._count.messages]),
    );

    return agents.map(({ messages, channelReads: _cr, _count: _c, ...agent }) =>
      maskAgent({
        ...agent,
        lastMessage: messages[0]?.text ?? undefined,
        lastMessageTime: messages[0]?.createdAt?.toISOString() ?? undefined,
        unreadCount: unreadMap.get(agent.id) ?? noReadMap.get(agent.id) ?? 0,
      }),
    );
  }

  async markRead(channelId: string, userId: string) {
    // Verify ownership
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    await this.prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt: new Date() },
      create: { userId, channelId },
    });
  }

  async findById(id: string, ownerId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, ownerId },
      select: AGENT_SELECT,
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return maskAgent(agent);
  }

  /** Internal: resolve an agent + return its management credentials unmasked. */
  async getManagementCredentials(
    id: string,
    ownerId: string,
  ): Promise<{ url: string; apiKey: string } | null> {
    const agent = await this.prisma.agent.findFirst({
      where: { id, ownerId },
      select: { managementUrl: true, managementApiKey: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    if (!agent.managementUrl || !agent.managementApiKey) return null;
    return { url: agent.managementUrl, apiKey: agent.managementApiKey };
  }

  async create(ownerId: string, dto: CreateAgentDto) {
    const agent = await this.prisma.agent.create({
      data: {
        ownerId,
        name: dto.name,
        description: dto.description,
        avatarUrl: dto.avatarUrl,
        webhookUrl: dto.webhookUrl,
        tag: dto.tag,
      },
      select: AGENT_SELECT,
    });
    this.rosterEvents.emitRosterChanged(ownerId);
    return maskAgent(agent);
  }

  async update(id: string, ownerId: string, dto: UpdateAgentRequest) {
    await this.findById(id, ownerId);
    const updated = await this.prisma.agent.update({
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
        ...(dto.tag !== undefined && { tag: dto.tag }),
      },
      select: AGENT_SELECT,
    });
    return maskAgent(updated);
  }

  /** Register or clear management credentials for a channel. */
  async setManagement(
    channelId: string,
    ownerId: string,
    url: string | null,
    apiKey: string | null,
  ) {
    await this.findById(channelId, ownerId);
    const updated = await this.prisma.agent.update({
      where: { id: channelId },
      data: { managementUrl: url, managementApiKey: apiKey },
      select: AGENT_SELECT,
    });
    this.rosterEvents.emitRosterChanged(ownerId);
    return maskAgent(updated);
  }

  /** Set sub-channel metadata (HITL children of a main channel). */
  async setSubagent(
    channelId: string,
    ownerId: string,
    isSubagent: boolean,
    parentChannelId: string | null,
  ) {
    await this.findById(channelId, ownerId);
    if (parentChannelId) {
      await this.findById(parentChannelId, ownerId);
      await this.assertNoSubagentCycle(channelId, parentChannelId, ownerId);
    }
    const updated = await this.prisma.agent.update({
      where: { id: channelId },
      data: { isSubagent, parentAgentId: parentChannelId },
      select: AGENT_SELECT,
    });
    return maskAgent(updated);
  }

  /**
   * Walk the parentAgentId chain up from `parentId` to ensure `channelId` does
   * not appear as an ancestor. Guards against self-parent and cycles.
   */
  private async assertNoSubagentCycle(
    channelId: string,
    parentId: string,
    ownerId: string,
  ): Promise<void> {
    if (parentId === channelId) {
      throw new BadRequestException('A channel cannot be its own parent');
    }
    const MAX_DEPTH = 16;
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    for (let i = 0; i < MAX_DEPTH && cursor; i++) {
      if (seen.has(cursor)) {
        throw new BadRequestException('Sub-agent parent chain is cyclic');
      }
      seen.add(cursor);
      const row: { parentAgentId: string | null } | null =
        await this.prisma.agent.findFirst({
          where: { id: cursor, ownerId },
          select: { parentAgentId: true },
        });
      if (!row) return;
      if (row.parentAgentId === channelId) {
        throw new BadRequestException(
          'Sub-agent parent chain would cycle through this channel',
        );
      }
      cursor = row.parentAgentId;
    }
  }

  /**
   * Atomically configure a channel's webhook, optional management credentials,
   * and optional sub-agent flag in a single Prisma update.
   */
  async setWebhookConfig(
    channelId: string,
    ownerId: string,
    dto: {
      url: string;
      headers?: Record<string, string>;
      auth?: unknown;
      management?: { url: string; apiKey: string };
      isSubagent?: boolean;
      parentChannelId?: string | null;
    },
  ) {
    await this.findById(channelId, ownerId);
    if (dto.parentChannelId) {
      await this.findById(dto.parentChannelId, ownerId);
      await this.assertNoSubagentCycle(channelId, dto.parentChannelId, ownerId);
    }
    const data: Prisma.AgentUncheckedUpdateInput = {
      webhookUrl: dto.url,
      webhookHeaders: jsonOrDbNull(dto.headers ?? null),
      webhookAuth: jsonOrDbNull(dto.auth ?? null),
    };
    if (dto.management) {
      data.managementUrl = dto.management.url;
      data.managementApiKey = dto.management.apiKey;
    }
    if (dto.isSubagent !== undefined) {
      data.isSubagent = dto.isSubagent;
    }
    if (dto.parentChannelId !== undefined) {
      data.parentAgentId = dto.parentChannelId;
    }
    const updated = await this.prisma.agent.update({
      where: { id: channelId },
      data,
      select: AGENT_SELECT,
    });
    return maskAgent(updated);
  }

  async updateCommands(id: string, ownerId: string, commands: unknown[]) {
    await this.findById(id, ownerId);
    const updated = await this.prisma.agent.update({
      where: { id },
      data: { commands: commands as Prisma.InputJsonValue },
      select: AGENT_SELECT,
    });
    return maskAgent(updated);
  }

  async remove(id: string, ownerId: string) {
    await this.findById(id, ownerId);
    await this.prisma.agent.delete({ where: { id } });
    this.rosterEvents.emitRosterChanged(ownerId);
    return { deleted: true };
  }

  async pingStatus(
    agentId: string,
    ownerId: string,
    status: string,
    message?: string,
  ) {
    const current = await this.findById(agentId, ownerId);

    const now = new Date();
    // Only reset `statusSince` when the status actually transitions. Agents
    // ping their current status every ~60s as a liveness signal; if we
    // reset on every ping the uptime tile always shows near-zero. Still
    // always bump `lastActiveAt` so stale-detection works.
    const statusChanged = current.status !== status;
    const statusSince = statusChanged ? now : (current.statusSince ?? now);

    const [agent] = await Promise.all([
      this.prisma.agent.update({
        where: { id: agentId },
        data: {
          status,
          statusMessage: message ?? null,
          statusSince,
          lastActiveAt: now,
        },
        select: AGENT_SELECT,
      }),
      // Only record a history row on actual transitions to keep the
      // timeline meaningful (not flooded with identical keep-alive rows).
      statusChanged
        ? this.prisma.agentStatusHistory.create({
            data: {
              agentId,
              status,
              message: message ?? null,
            },
          })
        : Promise.resolve(null),
    ]);

    return maskAgent(agent);
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
      >`SELECT status_code < 400 AS is_success, COUNT(*) AS count
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
      >`SELECT status_code < 400 AS is_success, COUNT(*) AS count
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

    const updated = await this.prisma.agent.update({
      where: { id },
      data: { avatarUrl: storageKey },
      select: AGENT_SELECT,
    });
    return maskAgent(updated);
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

    const updated = await this.prisma.agent.update({
      where: { id },
      data: { avatarUrl: null },
      select: AGENT_SELECT,
    });
    return maskAgent(updated);
  }
}
