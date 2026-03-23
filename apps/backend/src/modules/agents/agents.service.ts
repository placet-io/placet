import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

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
  lastActiveAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
