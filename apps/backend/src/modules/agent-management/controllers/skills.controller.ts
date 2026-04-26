import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
@Controller('api/agents/:agentId/manage')
export class ManageSkillsController {
  constructor(private readonly client: ManagementClient) {}

  @Get('skills')
  @ApiOperation({ summary: 'List workspace + builtin skills' })
  skills(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'skills',
    });
  }

  @Post('skills')
  @ApiOperation({ summary: 'Install a skill from a base64-encoded zip' })
  createSkill(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: { name: string; zip: string; overwrite?: boolean },
  ) {
    if (!body || typeof body.name !== 'string' || !body.name.trim()) {
      throw new BadRequestException('Field "name" must be a non-empty string');
    }
    if (typeof body.zip !== 'string' || !body.zip) {
      throw new BadRequestException(
        'Field "zip" must be a base64-encoded string',
      );
    }
    if (body.overwrite !== undefined && typeof body.overwrite !== 'boolean') {
      throw new BadRequestException('Field "overwrite" must be a boolean');
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'skills',
      body,
      maxRequestBytes: 30 * 1024 * 1024,
    });
  }

  @Delete('skills/:name')
  @ApiOperation({ summary: 'Delete a workspace skill directory' })
  deleteSkill(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `skills/${encodeURIComponent(name)}`,
    });
  }

  @Get('scripts')
  @ApiOperation({ summary: 'List workspace scripts' })
  scripts(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'scripts',
    });
  }
}
