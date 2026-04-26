import {
  Controller,
  Delete,
  Get,
  Param,
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
@Controller('api/agents/:agentId/manage/sessions')
export class ManageSessionsController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List facio sessions' })
  list(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'sessions',
      query,
    });
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get full session history by key' })
  get(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `sessions/${encodeURIComponent(key)}`,
      query,
    });
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Delete a session (cache + file)' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `sessions/${encodeURIComponent(key)}`,
    });
  }
}
