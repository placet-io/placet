import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { ManagementClient } from '../management-client.service';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/audit')
export class ManageAuditController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'Filtered audit event list' })
  list(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'audit',
      query,
    });
  }

  @Get('tail')
  @ApiOperation({ summary: 'Last N audit events (today)' })
  tail(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'audit/tail',
      query,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Aggregated audit event counts' })
  stats(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'audit/stats',
      query,
    });
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'All audit events for a single run' })
  run(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `audit/runs/${encodeURIComponent(runId)}`,
    });
  }
}
