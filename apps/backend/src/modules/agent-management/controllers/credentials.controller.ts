import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { ManagementClient } from '../management-client.service';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/credentials')
export class ManageCredentialsController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List credential keys (values masked)' })
  list(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'credentials',
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new credential (rejects with 409 when key exists)',
  })
  create(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: { key: string; value: string; exposed?: boolean },
  ) {
    if (
      !body ||
      typeof body.key !== 'string' ||
      typeof body.value !== 'string'
    ) {
      throw new BadRequestException('Fields "key" and "value" must be strings');
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'credentials',
      body,
    });
  }

  // ----- Provider credentials (LLM provider api_key + OAuth) ----------

  @Get('providers')
  @ApiOperation({ summary: 'List LLM providers and their credential state' })
  listProviders(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'credentials/providers',
    });
  }

  @Post('providers')
  @ApiOperation({
    summary:
      'Set api_key/apiBase for a provider (create-only — 409 when already set)',
  })
  createProvider(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body()
    body: {
      name: string;
      value?: string;
      apiBase?: string | null;
      baseUrl?: string | null;
    },
  ) {
    if (
      !body ||
      typeof body.name !== 'string' ||
      (body.value !== undefined && typeof body.value !== 'string') ||
      (body.apiBase !== undefined &&
        body.apiBase !== null &&
        typeof body.apiBase !== 'string') ||
      (body.baseUrl !== undefined &&
        body.baseUrl !== null &&
        typeof body.baseUrl !== 'string') ||
      (body.value === undefined &&
        body.apiBase === undefined &&
        body.baseUrl === undefined)
    ) {
      throw new BadRequestException(
        'Field "name" must be a string and at least one of "value" or "apiBase" must be provided',
      );
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'credentials/providers',
      body,
    });
  }

  @Put('providers/:name')
  @ApiOperation({ summary: 'Upsert api_key/apiBase for a provider' })
  putProvider(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
    @Body()
    body: { value?: string; apiBase?: string | null; baseUrl?: string | null },
  ) {
    if (
      !body ||
      (body.value !== undefined && typeof body.value !== 'string') ||
      (body.apiBase !== undefined &&
        body.apiBase !== null &&
        typeof body.apiBase !== 'string') ||
      (body.baseUrl !== undefined &&
        body.baseUrl !== null &&
        typeof body.baseUrl !== 'string') ||
      (body.value === undefined &&
        body.apiBase === undefined &&
        body.baseUrl === undefined)
    ) {
      throw new BadRequestException(
        'At least one of "value" or "apiBase" must be provided',
      );
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PUT',
      path: `credentials/providers/${encodeURIComponent(name)}`,
      body,
    });
  }

  @Delete('providers/:name')
  @ApiOperation({
    summary:
      'Clear a provider api_key, or disconnect OAuth for OAuth providers',
  })
  deleteProvider(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `credentials/providers/${encodeURIComponent(name)}`,
    });
  }

  @Post('providers/:name/oauth/start')
  @ApiOperation({
    summary:
      'Start an OAuth login flow for a provider (e.g. github_copilot device flow)',
  })
  startOauth(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `credentials/providers/${encodeURIComponent(name)}/oauth/start`,
    });
  }

  @Get('providers/:name/oauth/poll')
  @ApiOperation({
    summary: 'Poll an in-progress OAuth login flow for completion',
  })
  pollOauth(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
    @Query('session_id') sessionId: string,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Query parameter "session_id" is required');
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `credentials/providers/${encodeURIComponent(name)}/oauth/poll?session_id=${encodeURIComponent(sessionId)}`,
    });
  }

  @Get(':key')
  @ApiOperation({ summary: 'Existence check for a single credential key' })
  get(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `credentials/${encodeURIComponent(key)}`,
    });
  }

  @Put(':key')
  @ApiOperation({ summary: 'Upsert a credential value' })
  put(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
    @Body() body: { value: string },
  ) {
    if (!body || typeof body.value !== 'string') {
      throw new BadRequestException('Field "value" must be a string');
    }
    if (Buffer.byteLength(body.value, 'utf8') > 64 * 1024) {
      throw new BadRequestException('Credential value exceeds 64KB limit');
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PUT',
      path: `credentials/${encodeURIComponent(key)}`,
      body,
    });
  }

  @Put(':key/exposed')
  @ApiOperation({
    summary:
      'Toggle whether this credential is injected as an env var into the exec sandbox',
  })
  putExposed(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
    @Body() body: { exposed: boolean },
  ) {
    if (!body || typeof body.exposed !== 'boolean') {
      throw new BadRequestException('Field "exposed" must be a boolean');
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PUT',
      path: `credentials/${encodeURIComponent(key)}/exposed`,
      body,
    });
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Remove a credential' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `credentials/${encodeURIComponent(key)}`,
    });
  }
}
