import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/swagger-responses';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { PluginsService } from './plugins.service';

@ApiTags('Plugins')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('api/v1/plugins')
export class PluginsAgentController {
  constructor(private readonly registry: PluginsService) {}

  @Get()
  @ApiOperation({ summary: 'List installed plugins' })
  @ApiOkResponse({ description: 'List of plugin manifests' })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  findAll() {
    return this.registry.getManifests();
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get plugin details' })
  @ApiOkResponse({ description: 'Plugin manifest' })
  @ApiNotFoundResponse({ description: 'Plugin not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  findOne(@Param('name') name: string) {
    const plugin = this.registry.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }
    return plugin.manifest;
  }
}
