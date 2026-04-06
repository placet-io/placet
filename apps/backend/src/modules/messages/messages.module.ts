import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesAgentController } from './messages-agent.controller';
import { ReviewsAgentController } from './reviews-agent.controller';
import { MessagesService } from './messages.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { EventsModule } from '../events/events.module';
import { PushModule } from '../push/push.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [WebhooksModule, EventsModule, PushModule, FilesModule],
  controllers: [
    MessagesController,
    MessagesAgentController,
    ReviewsAgentController,
  ],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
