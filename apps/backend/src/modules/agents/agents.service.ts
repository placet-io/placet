import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  private generateApiKey(): { rawKey: string; hash: string; prefix: string } {
    const random = randomBytes(24).toString('hex');
    const rawKey = `hp_${random}`;
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 11); // "hp_" + first 8 chars
    return { rawKey, hash, prefix };
  }

  async findAllByOwner(ownerId: string) {
    return this.prisma.agent.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        description: true,
        apiKeyPrefix: true,
        avatarUrl: true,
        lastActiveAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, ownerId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, ownerId },
      select: {
        id: true,
        name: true,
        description: true,
        apiKeyPrefix: true,
        avatarUrl: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async create(ownerId: string, dto: CreateAgentDto) {
    const { rawKey, hash, prefix } = this.generateApiKey();

    const agent = await this.prisma.agent.create({
      data: {
        ownerId,
        name: dto.name,
        description: dto.description,
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        avatarUrl: dto.avatarUrl,
      },
      select: {
        id: true,
        name: true,
        description: true,
        apiKeyPrefix: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return { ...agent, apiKey: rawKey };
  }

  async update(id: string, ownerId: string, dto: UpdateAgentDto) {
    await this.findById(id, ownerId);
    return this.prisma.agent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
      select: {
        id: true,
        name: true,
        description: true,
        apiKeyPrefix: true,
        avatarUrl: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
  }

  async remove(id: string, ownerId: string) {
    await this.findById(id, ownerId);
    await this.prisma.agent.delete({ where: { id } });
    return { deleted: true };
  }

  async rotateKey(id: string, ownerId: string) {
    await this.findById(id, ownerId);
    const { rawKey, hash, prefix } = this.generateApiKey();

    await this.prisma.agent.update({
      where: { id },
      data: { apiKeyHash: hash, apiKeyPrefix: prefix },
    });

    return { apiKey: rawKey, apiKeyPrefix: prefix };
  }
}
