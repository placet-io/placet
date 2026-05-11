import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { ManagementClient } from '../management-client.service';
import { assertNonEmptyString } from '../body-validation';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/commands')
export class ManageCommandsController {
  constructor(private readonly client: ManagementClient) {}

  @Post('stop')
  @ApiOperation({ summary: 'Execute /stop on a session' })
  stop(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: { sessionKey?: string } = {},
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'commands/stop',
      body,
    });
  }

  @Post('restart')
  @ApiOperation({ summary: 'Execute /restart (process-wide)' })
  restart(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'commands/restart',
      body: {},
    });
  }

  @Post('new')
  @ApiOperation({ summary: 'Execute /new on a session (reset)' })
  newSession(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: { sessionKey: string },
  ) {
    assertNonEmptyString(body?.sessionKey, 'sessionKey');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'commands/new',
      body,
    });
  }

  @Post('reflect')
  @ApiOperation({ summary: 'Execute /reflect on a session' })
  reflect(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: { sessionKey?: string } = {},
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'commands/reflect',
      body,
    });
  }

  @Get('status')
  @ApiOperation({ summary: 'Get session status via /status' })
  status(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'commands/status',
      query,
    });
  }
}
