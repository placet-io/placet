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

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/mcp')
export class ManageMcpController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List MCP servers' })
  list(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'mcp',
    });
  }

  @Post()
  @ApiOperation({ summary: 'Add an MCP server' })
  add(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: 'mcp',
      body,
    });
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get a single MCP server summary' })
  get(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `mcp/${encodeURIComponent(name)}`,
    });
  }

  @Patch(':name')
  @ApiOperation({ summary: 'Edit MCP server config' })
  edit(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PATCH',
      path: `mcp/${encodeURIComponent(name)}`,
      body,
    });
  }

  @Delete(':name')
  @ApiOperation({ summary: 'Remove an MCP server' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `mcp/${encodeURIComponent(name)}`,
    });
  }

  @Post(':name/enable')
  @ApiOperation({ summary: 'Enable and connect an MCP server' })
  enable(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `mcp/${encodeURIComponent(name)}/enable`,
      body: {},
    });
  }

  @Post(':name/disable')
  @ApiOperation({ summary: 'Disable and disconnect an MCP server' })
  disable(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `mcp/${encodeURIComponent(name)}/disable`,
      body: {},
    });
  }

  @Post(':name/restart')
  @ApiOperation({ summary: 'Restart (reconnect) an MCP server' })
  restart(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('name') name: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'POST',
      path: `mcp/${encodeURIComponent(name)}/restart`,
      body: {},
    });
  }
}
