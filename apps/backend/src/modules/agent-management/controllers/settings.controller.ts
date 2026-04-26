import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
@Controller('api/agents/:agentId/manage/settings')
export class ManageSettingsController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'Get agent settings (secrets redacted)' })
  get(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'settings',
    });
  }

  @Patch()
  @ApiOperation({ summary: 'Patch agent settings' })
  patch(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PATCH',
      path: 'settings',
      body,
    });
  }
}
