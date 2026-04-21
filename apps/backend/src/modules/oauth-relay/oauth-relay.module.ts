import { Module, forwardRef } from '@nestjs/common';
import { OAuthRelayController } from './oauth-relay.controller';
import { OAuthRelayService } from './oauth-relay.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [forwardRef(() => EventsModule)],
  controllers: [OAuthRelayController],
  providers: [OAuthRelayService],
  exports: [OAuthRelayService],
})
export class OAuthRelayModule {}
