import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
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
import { ApiLoggerInterceptor } from './middleware/api-logger.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: process.env.LOG_LEVEL ?? 'info',
      },
    }),
    PrismaModule,
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiLoggerInterceptor,
    },
  ],
})
export class AppModule {}
