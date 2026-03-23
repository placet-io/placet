import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../../prisma/prisma.service';

// Debounce lastUsedAt writes: at most once per 5 minutes per key
const LAST_USED_DEBOUNCE_MS = 5 * 60 * 1000;

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly lastUsedCache = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer hp_')) {
      throw new UnauthorizedException('Missing or invalid API key');
    }

    const rawKey = authHeader.slice(7); // Remove "Bearer "
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Debounce lastUsedAt: only write if last update was > 5 min ago
    const now = Date.now();
    const lastWrite = this.lastUsedCache.get(apiKey.id) ?? 0;
    if (now - lastWrite > LAST_USED_DEBOUNCE_MS) {
      this.lastUsedCache.set(apiKey.id, now);
      void this.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      });
    }

    // Set user on request — the API key authenticates as the owning user
    (request as unknown as Record<string, unknown>)['user'] = apiKey.user;
    (request as unknown as Record<string, unknown>)['apiKeyId'] = apiKey.id;
    return true;
  }
}
