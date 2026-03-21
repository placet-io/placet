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

interface AgentApiRequest extends FastifyRequest {
  agent?: { id: string };
  user?: { id: string };
}

@Injectable()
export class ApiLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiLoggerInterceptor.name);

  constructor(
    @Optional() @Inject(LogsService) private readonly logsService?: LogsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AgentApiRequest>();
    const isAgentApi = request.url?.startsWith('/api/v1/');

    if (!isAgentApi || !request.agent || !this.logsService) {
      return next.handle();
    }

    const logsService = this.logsService;
    const agentId = request.agent.id;
    const userId = request.user?.id ?? '';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => {
          const duration = Date.now() - startTime;
          const response = context.switchToHttp().getResponse<FastifyReply>();

          void logsService
            .create({
              agentId,
              userId,
              method: request.method,
              path: request.url,
              requestBody: (request.body as Prisma.InputJsonValue) ?? undefined,
              responseBody:
                (responseBody as Prisma.InputJsonValue) ?? undefined,
              statusCode: response.statusCode ?? 200,
              durationMs: duration,
              direction: 'inbound',
            })
            .catch((err: unknown) => {
              this.logger.error('Failed to write API log', err);
            });
        },
        error: (error: { message?: string; status?: number }) => {
          const duration = Date.now() - startTime;

          void logsService
            .create({
              agentId,
              userId,
              method: request.method,
              path: request.url,
              requestBody: (request.body as Prisma.InputJsonValue) ?? undefined,
              responseBody: { error: error.message ?? 'Unknown error' },
              statusCode: error.status ?? 500,
              durationMs: duration,
              direction: 'inbound',
            })
            .catch((err: unknown) => {
              this.logger.error('Failed to write API log', err);
            });
        },
      }),
    );
  }
}
