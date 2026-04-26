import {
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
@Controller('api/agents/:agentId/manage/a2a/peers')
export class ManageA2aPeersController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List registered A2A peers' })
  list(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'a2a/peers',
    });
  }

  @Post()
  @ApiOperation({ summary: 'Register or overwrite an A2A peer' })
  put(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'a2a/peers',
      body,
    });
  }

  @Delete(':alias')
  @ApiOperation({ summary: 'Remove an A2A peer' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('alias') alias: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `a2a/peers/${encodeURIComponent(alias)}`,
    });
  }

  @Get(':alias/card')
  @ApiOperation({ summary: 'Fetch the peer Agent Card' })
  card(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('alias') alias: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `a2a/peers/${encodeURIComponent(alias)}/card`,
    });
  }

  @Post(':alias/call')
  @ApiOperation({ summary: 'Send a message through the registered peer' })
  call(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('alias') alias: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `a2a/peers/${encodeURIComponent(alias)}/call`,
      body,
    });
  }
}
