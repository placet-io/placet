import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
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
@Controller('api/agents/:agentId/manage/workspace')
export class ManageWorkspaceController {
  constructor(private readonly client: ManagementClient) {}

  @Get('tree')
  @ApiOperation({ summary: 'Directory tree listing' })
  tree(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'workspace/tree',
      query,
    });
  }

  @Get('file')
  @ApiOperation({ summary: 'Read file contents' })
  read(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'workspace/file',
      query,
    });
  }

  @Put('file')
  @ApiOperation({ summary: 'Write file contents' })
  write(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PUT',
      path: 'workspace/file',
      query,
      body,
    });
  }

  @Delete('file')
  @ApiOperation({ summary: 'Delete a file' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: 'workspace/file',
      query,
    });
  }
}
