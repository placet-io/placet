import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { lookup } from 'dns/promises';
import * as fs from 'fs';
import * as path from 'path';
import { ErrorResponse } from '../../common/swagger-responses';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdatePluginConfigDto } from './dto/update-plugin-config.dto';
import { PluginsService } from './plugins.service';

@ApiTags('Plugins')
@Controller('api/plugins')
export class PluginsController {
  private readonly allowLocalFetch: boolean;

  constructor(
    private readonly registry: PluginsService,
    private readonly config: ConfigService,
  ) {
    this.allowLocalFetch =
      this.config.get<string>('ALLOW_PLUGIN_LOCAL_FETCH', 'false') === 'true';
  }

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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get plugin render HTML (for iframe)' })
  @ApiOkResponse({ description: 'Plugin render.html content (text/html)' })
  @ApiNotFoundResponse({ description: 'Plugin not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async getRenderHtml(@Param('name') name: string) {
    const html = this.registry.getRenderHtml(name);
    if (html === undefined) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }
    const env = await this.registry.getResolvedEnv(name);
    return { html, env };
  }

  @Get(':name/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get plugin config (env values)' })
  @ApiOkResponse({ description: 'Plugin config' })
  @ApiNotFoundResponse({ description: 'Plugin not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async getConfig(@Param('name') name: string) {
    if (!this.registry.isRegistered(name)) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }
    const config = await this.registry.getConfig(name);
    const plugin = this.registry.getPlugin(name);
    return {
      ...config,
      envSchema: plugin?.manifest.env ?? [],
    };
  }

  @Put(':name/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update plugin config (env values)' })
  @ApiOkResponse({ description: 'Updated plugin config' })
  @ApiNotFoundResponse({ description: 'Plugin not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async updateConfig(
    @Param('name') name: string,
    @Body() dto: UpdatePluginConfigDto,
  ) {
    if (!this.registry.isRegistered(name)) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }
    return this.registry.setConfig(name, dto.envValues, dto.enabled);
  }

  @Post(':name/fetch')
  @ApiOperation({ summary: 'Proxy an HTTP request on behalf of a plugin' })
  @ApiOkResponse({ description: 'Proxied response' })
  @ApiNotFoundResponse({ description: 'Plugin not found', type: ErrorResponse })
  async proxyFetch(
    @Param('name') name: string,
    @Body()
    body: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ) {
    const plugin = this.registry.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }

    const permissions = plugin.manifest.permissions;
    if (!permissions?.httpRequests) {
      throw new BadRequestException(
        'HTTP requests not permitted for this plugin',
      );
    }

    // Validate URL: parse, check domain allowlist, and SSRF protection
    await this.validateFetchUrl(body.url, permissions.maxHttpDomains);

    try {
      const res = await fetch(body.url, {
        method: body.method || 'GET',
        headers: body.headers || {},
        body: body.body,
      });

      const responseBody = await res.text();
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        statusText: 'Fetch failed',
        headers: {},
        body: '',
        error: err instanceof Error ? err.message : 'Fetch failed',
      };
    }
  }

  @Get(':name/icon')
  @ApiOperation({ summary: 'Get plugin icon file' })
  @ApiOkResponse({ description: 'Plugin icon (image/svg+xml or image/png)' })
  @ApiNotFoundResponse({
    description: 'Plugin or icon not found',
    type: ErrorResponse,
  })
  async getIcon(@Param('name') name: string, @Res() reply: FastifyReply) {
    const iconPath = this.registry.getIconPath(name);
    if (!iconPath) {
      throw new NotFoundException(`Icon not found for plugin "${name}"`);
    }

    const ALLOWED_ICON_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(iconPath).toLowerCase();
    if (!ALLOWED_ICON_EXTENSIONS.includes(ext)) {
      throw new BadRequestException('Unsupported icon format');
    }

    const mimeTypes: Record<string, string> = {
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };

    const contentType = mimeTypes[ext] ?? 'application/octet-stream';
    const stream = fs.createReadStream(iconPath);
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(stream);
  }

  // ── SSRF Protection ───────────────────────────────────────────────────

  private static readonly BLOCKED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
    '169.254.169.254',
    'metadata.google.internal',
  ];

  private isPrivateIp(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip === '0.0.0.0' ||
      ip === '::1' ||
      ip === '::' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
      ip.startsWith('169.254.') ||
      ip.startsWith('fe80:') ||
      ip.startsWith('fc00:') ||
      ip.startsWith('fd')
    );
  }

  private async validateFetchUrl(
    raw: string,
    allowedDomains?: string[],
  ): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new BadRequestException(
        `URL must use http or https (got ${parsed.protocol})`,
      );
    }

    // Check domain allowlist
    if (allowedDomains && !allowedDomains.includes('*')) {
      if (!allowedDomains.includes(parsed.hostname)) {
        throw new BadRequestException(
          `Domain "${parsed.hostname}" not in plugin allowlist`,
        );
      }
    }

    // SSRF protection (skip if ALLOW_PLUGIN_LOCAL_FETCH=true)
    if (!this.allowLocalFetch) {
      if (PluginsController.BLOCKED_HOSTS.includes(parsed.hostname)) {
        throw new BadRequestException(
          'URL must not point to a local or internal address',
        );
      }

      if (this.isPrivateIp(parsed.hostname)) {
        throw new BadRequestException(
          'URL must not point to a private network address',
        );
      }

      try {
        const { address } = await lookup(parsed.hostname);
        if (this.isPrivateIp(address)) {
          throw new BadRequestException(
            'URL resolves to a private or internal IP address',
          );
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(
          `Cannot resolve hostname: ${parsed.hostname}`,
        );
      }
    }
  }
}
