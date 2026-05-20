import {
  Body,
  Controller,
  Get,
  Header,
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
import { assertObjectBody } from '../body-validation';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/versions')
export class ManageVersionsController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List central agent versions' })
  listVersions(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'agent/versions',
      query,
    });
  }

  @Post('checkpoint')
  @ApiOperation({ summary: 'Create a central agent version checkpoint' })
  checkpoint(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertObjectBody(body, 'Version checkpoint body');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'agent/versions/checkpoint',
      body,
    });
  }

  @Get('runs')
  @ApiOperation({
    summary: 'List self-improvement runs that can create agent versions',
  })
  listRuns(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'improvement/runs',
      query,
    });
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Get a self-improvement run' })
  getRun(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `improvement/runs/${encodeURIComponent(runId)}`,
    });
  }

  @Get('runs/:runId/report')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  @ApiOperation({ summary: 'Get a self-improvement run report' })
  getRunReport(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `improvement/runs/${encodeURIComponent(runId)}/report`,
      responseType: 'text',
    });
  }

  @Get('runs/:runId/diff')
  @Header('Content-Type', 'text/x-diff; charset=utf-8')
  @ApiOperation({ summary: 'Get a self-improvement run diff artifact' })
  getRunDiff(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `improvement/runs/${encodeURIComponent(runId)}/diff`,
      query,
      responseType: 'text',
    });
  }

  @Post('runs/:runId/comment')
  @ApiOperation({ summary: 'Comment on a self-improvement run' })
  commentRun(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertObjectBody(body, 'Improvement comment body');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `improvement/runs/${encodeURIComponent(runId)}/comment`,
      body,
    });
  }

  @Post('runs/:runId/:action')
  @ApiOperation({
    summary: 'Approve, reject, or roll back a self-improvement run',
  })
  runAction(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
    @Param('action') action: 'approve' | 'reject' | 'rollback',
    @Body() body: Record<string, unknown>,
  ) {
    assertObjectBody(body, 'Improvement action body');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `improvement/runs/${encodeURIComponent(runId)}/${encodeURIComponent(action)}`,
      body,
    });
  }

  @Get(':sha')
  @ApiOperation({ summary: 'Get a central agent version' })
  getVersion(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('sha') sha: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `agent/versions/${encodeURIComponent(sha)}`,
    });
  }

  @Get(':sha/diff')
  @Header('Content-Type', 'text/x-diff; charset=utf-8')
  @ApiOperation({ summary: 'Get a central agent version diff' })
  getVersionDiff(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('sha') sha: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `agent/versions/${encodeURIComponent(sha)}/diff`,
      query,
      responseType: 'text',
    });
  }

  @Post(':sha/rollback')
  @ApiOperation({ summary: 'Roll back to a central agent version' })
  rollbackVersion(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('sha') sha: string,
    @Body() body: Record<string, unknown>,
  ) {
    assertObjectBody(body, 'Version rollback body');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `agent/versions/${encodeURIComponent(sha)}/rollback`,
      body,
    });
  }
}

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/improvement')
export class LegacyManageImprovementController {
  constructor(private readonly client: ManagementClient) {}

  @Get('runs')
  @ApiOperation({ summary: 'Legacy alias: list self-improvement runs' })
  listRuns(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'improvement/runs',
      query,
    });
  }

  @Post('runs/:runId/:action')
  @ApiOperation({
    summary:
      'Legacy alias: approve, reject, or roll back a self-improvement run',
  })
  runAction(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
    @Param('action') action: 'approve' | 'reject' | 'rollback',
    @Body() body: Record<string, unknown>,
  ) {
    assertObjectBody(body, 'Improvement action body');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `improvement/runs/${encodeURIComponent(runId)}/${encodeURIComponent(action)}`,
      body,
    });
  }
}
