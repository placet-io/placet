import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [LogsModule],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
