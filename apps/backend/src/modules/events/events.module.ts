import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventsGateway } from './events.gateway';
import { OAuthRelayModule } from '../oauth-relay/oauth-relay.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me-in-production'),
      }),
    }),
    forwardRef(() => OAuthRelayModule),
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
