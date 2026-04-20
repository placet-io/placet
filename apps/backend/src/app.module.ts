import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { S3Module } from './providers/s3.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AgentsModule } from './modules/agents/agents.module';
import { MessagesModule } from './modules/messages/messages.module';
import { FilesModule } from './modules/files/files.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { LogsModule } from './modules/logs/logs.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { EventsModule } from './modules/events/events.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { ShareModule } from './modules/share/share.module';
import { PushModule } from './modules/push/push.module';
import { OAuthRelayModule } from './modules/oauth-relay/oauth-relay.module';
import { ApiLoggerInterceptor } from './middleware/api-logger.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const format = config.get<string>('LOG_FORMAT', 'pretty');
        const usePretty = format !== 'json';
        return {
          exclude: [
            { method: RequestMethod.ALL, path: 'health' },
            { method: RequestMethod.ALL, path: 'api/docs' },
          ],
          pinoHttp: {
            transport: usePretty
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'HH:MM:ss.l',
                    ignore: 'pid,hostname,context,req,res,responseTime',
                    messageFormat:
                      '{if context}[{context}] {end}{msg}{if responseTime} {responseTime}ms{end}',
                  },
                }
              : undefined,
            level: config.get<string>('LOG_LEVEL', 'info'),
            serializers: {
              req(req: Record<string, unknown>) {
                return { method: req.method, url: req.url };
              },
              res(res: Record<string, unknown>) {
                return { statusCode: res.statusCode };
              },
            },
            // customSuccessMessage runs in-process (not serialized)
            customSuccessMessage: (req, res) => {
              const method =
                (req as unknown as Record<string, string>).method ?? '';
              const url = (req as unknown as Record<string, string>).url ?? '';
              const statusCode =
                (res as unknown as Record<string, number>).statusCode ?? '';
              return `${method} ${url} ${statusCode}`;
            },
            customErrorMessage: (req, res) => {
              const method =
                (req as unknown as Record<string, string>).method ?? '';
              const url = (req as unknown as Record<string, string>).url ?? '';
              const statusCode =
                (res as unknown as Record<string, number>).statusCode ?? '';
              return `${method} ${url} ${statusCode}`;
            },
          },
        };
      },
    }),
    PrismaModule,
    S3Module,
    AuthModule,
    UsersModule,
    AgentsModule,
    MessagesModule,
    FilesModule,
    PreferencesModule,
    LogsModule,
    WebhooksModule,
    EventsModule,
    PluginsModule,
    ApiKeysModule,
    ShareModule,
    PushModule,
    OAuthRelayModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiLoggerInterceptor,
    },
  ],
})
export class AppModule {}
