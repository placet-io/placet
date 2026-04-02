import { Module } from '@nestjs/common';
import { PluginsService } from './plugins.service';
import { PluginsController } from './plugins.controller';
import { PluginsAgentController } from './plugins-agent.controller';

@Module({
  providers: [PluginsService],
  controllers: [PluginsController, PluginsAgentController],
  exports: [PluginsService],
})
export class PluginsModule {}
