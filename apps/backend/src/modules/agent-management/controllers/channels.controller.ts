import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
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
@Controller('api/agents/:agentId/manage/channels')
export class ManageChannelsController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List channel configurations' })
  list(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'channels',
    });
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get a single channel configuration' })
  get(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `channels/${encodeURIComponent(name)}`,
    });
  }

  @Put(':name')
  @ApiOperation({
    summary: 'Upsert a channel configuration (restart required)',
  })
  put(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PUT',
      path: `channels/${encodeURIComponent(name)}`,
      body,
    });
  }

  @Delete(':name')
  @ApiOperation({
    summary: 'Remove a channel configuration (restart required)',
  })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `channels/${encodeURIComponent(name)}`,
    });
  }
}
