import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/swagger-responses';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PluginsService } from './plugins.service';

@ApiTags('Plugins')
@Controller('api/plugins')
export class PluginsController {
  constructor(private readonly registry: PluginsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List installed plugins' })
  @ApiOkResponse({ description: 'List of plugin manifests' })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  findAll() {
    return this.registry.getManifests();
  }

  @Get(':name')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get plugin details' })
  @ApiOkResponse({ description: 'Plugin manifest' })
  @ApiNotFoundResponse({ description: 'Plugin not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  findOne(@Param('name') name: string) {
    const plugin = this.registry.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }
    return plugin.manifest;
  }

  @Get(':name/render')
  @ApiOperation({ summary: 'Get plugin render HTML (for iframe)' })
  @ApiOkResponse({ description: 'Plugin render.html content (text/html)' })
  @ApiNotFoundResponse({ description: 'Plugin not found', type: ErrorResponse })
  getRenderHtml(@Param('name') name: string) {
    const html = this.registry.getRenderHtml(name);
    if (html === undefined) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }
    return { html };
  }
}
