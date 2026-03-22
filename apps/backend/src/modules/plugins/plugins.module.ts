import { Module } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginsController } from './plugins.controller';

@Module({
  providers: [PluginRegistryService],
  controllers: [PluginsController],
  exports: [PluginRegistryService],
})
export class PluginsModule {}
