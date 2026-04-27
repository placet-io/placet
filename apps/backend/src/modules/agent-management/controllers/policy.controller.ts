import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { ManagementClient } from '../management-client.service';

interface PolicyRuleBody {
  action?: unknown;
  tool?: unknown;
  params?: unknown;
  addedBy?: unknown;
}

function validateRuleBody(body: PolicyRuleBody | undefined): {
  action: 'allow' | 'deny';
  tool: string;
  params: Record<string, string>;
  addedBy?: string;
} {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Body must be an object');
  }
  if (body.action !== 'allow' && body.action !== 'deny') {
    throw new BadRequestException('Field "action" must be "allow" or "deny"');
  }
  if (typeof body.tool !== 'string' || !body.tool) {
    throw new BadRequestException('Field "tool" must be a non-empty string');
  }
  let params: Record<string, string> = {};
  if (body.params !== undefined && body.params !== null) {
    if (typeof body.params !== 'object' || Array.isArray(body.params)) {
      throw new BadRequestException('Field "params" must be an object');
    }
    params = Object.fromEntries(
      Object.entries(body.params as Record<string, unknown>).map(([k, v]) => [
        String(k),
        String(v),
      ]),
    );
  }
  const addedBy =
    typeof body.addedBy === 'string' && body.addedBy ? body.addedBy : undefined;
  return { action: body.action, tool: body.tool, params, addedBy };
}

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/policy')
export class ManagePolicyController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List tool-policy allow/deny rules' })
  list(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'policy',
    });
  }

  @Post()
  @ApiOperation({ summary: 'Add a tool-policy rule' })
  add(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: PolicyRuleBody,
  ) {
    const validated = validateRuleBody(body);
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'policy',
      body: validated,
    });
  }

  @Delete('all')
  @ApiOperation({ summary: 'Clear all tool-policy rules' })
  clear(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: 'policy/all',
    });
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Toggle the master policy switch and/or the cron-skip flag',
  })
  patchSettings(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: { enabled?: unknown; skipCron?: unknown },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body must be an object');
    }
    const out: { enabled?: boolean; skipCron?: boolean } = {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') {
        throw new BadRequestException('Field "enabled" must be a boolean');
      }
      out.enabled = body.enabled;
    }
    if (body.skipCron !== undefined) {
      if (typeof body.skipCron !== 'boolean') {
        throw new BadRequestException('Field "skipCron" must be a boolean');
      }
      out.skipCron = body.skipCron;
    }
    if (Object.keys(out).length === 0) {
      throw new BadRequestException(
        'At least one of "enabled" / "skipCron" required',
      );
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PATCH',
      path: 'policy/settings',
      body: out,
    });
  }

  @Delete()
  @ApiOperation({ summary: 'Remove a tool-policy rule' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: PolicyRuleBody,
  ) {
    const validated = validateRuleBody(body);
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: 'policy',
      body: validated,
    });
  }
}
