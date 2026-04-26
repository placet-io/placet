import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { ManagementClient } from '../management-client.service';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/health')
export class ManageHealthController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'Facio management surface liveness check' })
  check(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'health',
    });
  }
}
