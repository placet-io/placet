import {
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
import { assertNonEmptyString, assertObjectBody } from '../body-validation';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/cron')
export class ManageCronController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List cron jobs' })
  list(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'cron',
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a cron job' })
  create(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertObjectBody(body, 'Cron job body');
    assertNonEmptyString(body.name, 'name');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'cron',
      body,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single cron job' })
  get(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `cron/${encodeURIComponent(id)}`,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a cron job' })
  update(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertObjectBody(body, 'Cron job patch');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PATCH',
      path: `cron/${encodeURIComponent(id)}`,
      body,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a cron job' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `cron/${encodeURIComponent(id)}`,
    });
  }

  @Post(':id/run-now')
  @ApiOperation({ summary: 'Trigger a cron job out of schedule' })
  runNow(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `cron/${encodeURIComponent(id)}/run-now`,
      body: {},
    });
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a cron job' })
  pause(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `cron/${encodeURIComponent(id)}/pause`,
      body: {},
    });
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a cron job' })
  resume(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `cron/${encodeURIComponent(id)}/resume`,
      body: {},
    });
  }
}
