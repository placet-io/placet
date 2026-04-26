import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { ManagementClient } from '../management-client.service';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/usage')
export class ManageUsageController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({
    summary: 'Aggregated token usage (totals + grouped buckets)',
  })
  query(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'usage',
      query,
    });
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Token usage for a single run' })
  run(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `usage/runs/${encodeURIComponent(runId)}`,
    });
  }
}
