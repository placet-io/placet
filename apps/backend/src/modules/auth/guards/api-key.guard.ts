import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../../prisma/prisma.service';

// Debounce lastActiveAt writes: at most once per 5 minutes per agent
const LAST_ACTIVE_DEBOUNCE_MS = 5 * 60 * 1000;

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly lastActiveCache = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer hp_')) {
      throw new UnauthorizedException('Missing or invalid API key');
    }

    const apiKey = authHeader.slice(7); // Remove "Bearer "
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    const agent = await this.prisma.agent.findUnique({
      where: { apiKeyHash },
      include: { owner: true },
    });

    if (!agent) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Debounce lastActiveAt: only write if last update was > 5 min ago
    const now = Date.now();
    const lastWrite = this.lastActiveCache.get(agent.id) ?? 0;
    if (now - lastWrite > LAST_ACTIVE_DEBOUNCE_MS) {
      this.lastActiveCache.set(agent.id, now);
      void this.prisma.agent.update({
        where: { id: agent.id },
        data: { lastActiveAt: new Date() },
      });
    }

    (request as unknown as Record<string, unknown>)['agent'] = agent;
    (request as unknown as Record<string, unknown>)['user'] = agent.owner;
    return true;
  }
}
