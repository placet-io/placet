import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    userId: string,
    query: {
      agentId?: string;
      direction?: string;
      status?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    const limit = query.limit ?? 50;
    const where: Prisma.ApiLogWhereInput = { userId };

    if (query.agentId) where.agentId = query.agentId;
    if (query.direction) where.direction = query.direction;
    if (query.status) where.statusCode = parseInt(query.status, 10);

    const logs = await this.prisma.apiLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(query.cursor && {
        cursor: { id: query.cursor },
        skip: 1,
      }),
    });

    return {
      data: logs,
      nextCursor: logs.length === limit ? logs[logs.length - 1]?.id : null,
    };
  }

  async findOne(id: string, userId: string) {
    const log = await this.prisma.apiLog.findFirst({
      where: { id, userId },
    });
    if (!log) throw new NotFoundException('Log not found');
    return log;
  }

  async create(data: Prisma.ApiLogUncheckedCreateInput) {
    return this.prisma.apiLog.create({ data });
  }
}
