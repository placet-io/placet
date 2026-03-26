import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import { LogsService } from '../modules/logs/logs.service';

interface ApiKeyRequest extends FastifyRequest {
  user?: { id: string };
  apiKeyId?: string;
}

@Injectable()
export class ApiLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiLoggerInterceptor.name);

  constructor(
    @Optional() @Inject(LogsService) private readonly logsService?: LogsService,
  ) {}

  private maskSensitive(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.maskSensitive(item));

    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower === 'authorization'
      ) {
        masked[key] = '***';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSensitive(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const isAgentApi = request.url?.startsWith('/api/v1/');

    if (!isAgentApi || !request.user || !this.logsService) {
      return next.handle();
    }

    const apiKeyId = request.apiKeyId ?? null;
    const userId = request.user.id;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => {
          const duration = Date.now() - startTime;
          const response = context.switchToHttp().getResponse<FastifyReply>();

          this.logsService!.create({
            apiKeyId,
            userId,
            method: request.method,
            path: request.url,
            requestBody:
              (this.maskSensitive(request.body) as Prisma.InputJsonValue) ??
              undefined,
            responseBody: (responseBody as Prisma.InputJsonValue) ?? undefined,
            statusCode: response.statusCode ?? 200,
            durationMs: duration,
            direction: 'inbound',
          }).catch((err: unknown) => {
            this.logger.error('Failed to write API log', err);
          });
        },
        error: (error: { message?: string; status?: number }) => {
          const duration = Date.now() - startTime;

          this.logsService!.create({
            apiKeyId,
            userId,
            method: request.method,
            path: request.url,
            requestBody:
              (this.maskSensitive(request.body) as Prisma.InputJsonValue) ??
              undefined,
            responseBody: { error: error.message ?? 'Unknown error' },
            statusCode: error.status ?? 500,
            durationMs: duration,
            direction: 'inbound',
          }).catch((err: unknown) => {
            this.logger.error('Failed to write API log', err);
          });
        },
      }),
    );
  }
}
