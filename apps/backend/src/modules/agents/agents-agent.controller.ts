import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AgentResponse,
  DeletedResponse,
  ErrorResponse,
} from '../../common/swagger-responses';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import type { RequestWithUser } from '../../common/types';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { SetWebhookDto, DeleteWebhookDto } from './dto/set-webhook.dto';
import { SetTagDto } from './dto/set-tag.dto';
import { SetManagementDto } from './dto/set-management.dto';
import { SetSubagentDto } from './dto/set-subagent.dto';
import { UpdateCommandsDto } from './dto/update-commands.dto';

@ApiTags('Agents')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('api/v1/agents')
export class AgentsAgentController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List channels (agents) accessible by this API key',
  })
  @ApiOkResponse({ description: 'List of agents', type: [AgentResponse] })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async findAll(@Req() req: RequestWithUser) {
    return this.agentsService.findAllByOwnerSimple(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new channel (agent)' })
  @ApiCreatedResponse({ description: 'Agent created', type: AgentResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async create(@Req() req: RequestWithUser, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a channel (agent)' })
  @ApiOkResponse({ description: 'Agent updated', type: AgentResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a channel (agent)' })
  @ApiOkResponse({ description: 'Agent deleted', type: DeletedResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.remove(id, req.user.id);
  }

  @Post('setWebhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set webhook URL for a channel',
    description:
      'Register a webhook URL that will receive events (message:created, review:responded) for the given channel. Replaces any previously configured webhook.',
  })
  @ApiOkResponse({ description: 'Webhook configured', type: AgentResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async setWebhook(@Req() req: RequestWithUser, @Body() dto: SetWebhookDto) {
    return this.agentsService.setWebhookConfig(dto.channelId, req.user.id, {
      url: dto.url,
      headers: dto.headers,
      auth: dto.auth,
      management: dto.management,
      isSubagent: dto.isSubagent,
      parentChannelId:
        dto.parentChannelId !== undefined ? dto.parentChannelId : undefined,
    });
  }

  @Post('deleteWebhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove webhook URL from a channel',
    description:
      'Removes the currently configured webhook so no more events are delivered via HTTP callback.',
  })
  @ApiOkResponse({
    description: 'Webhook removed',
    type: AgentResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async deleteWebhook(
    @Req() req: RequestWithUser,
    @Body() dto: DeleteWebhookDto,
  ) {
    return this.agentsService.update(dto.channelId, req.user.id, {
      webhookUrl: null,
      webhookHeaders: null,
      webhookAuth: null,
    });
  }

  @Put(':id/commands')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update slash commands for an agent',
    description:
      'Persists the slash command metadata exposed by the agent. Frontends fetch this to render a command palette.',
  })
  @ApiOkResponse({ description: 'Commands updated', type: AgentResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async updateCommands(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommandsDto,
  ) {
    return this.agentsService.updateCommands(id, req.user.id, dto.commands);
  }

  @Post('setTag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set grouping tag for a channel',
    description:
      'Assigns a short tag (e.g. "monitoring", "prod") to a channel. Used by frontends for grouping in the chat list. Pass null to clear the tag.',
  })
  @ApiOkResponse({ description: 'Tag updated', type: AgentResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async setTag(@Req() req: RequestWithUser, @Body() dto: SetTagDto) {
    return this.agentsService.update(dto.channelId, req.user.id, {
      tag: dto.tag,
    });
  }

  @Post('setManagement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register Facio management credentials for a channel',
    description:
      'Stores the Facio `/api/v1/*` base URL and bearer token used by the Placet management dashboard proxy. Pass null values to clear. Only the main channel of a facio instance should carry management creds; HITL sub-channels must omit them and set `isSubagent` via `setWebhook`.',
  })
  @ApiOkResponse({
    description: 'Management credentials updated',
    type: AgentResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async setManagement(
    @Req() req: RequestWithUser,
    @Body() dto: SetManagementDto,
  ) {
    return this.agentsService.setManagement(
      dto.channelId,
      req.user.id,
      dto.url,
      dto.apiKey,
    );
  }

  @Post('setSubagent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Flag a channel as HITL sub-channel (or promote back to main)',
    description:
      'Marks the channel as a sub-channel of a parent agent (hidden from the management dashboard and grouped under the parent in chat lists) when `isSubagent` is true. Pass `isSubagent: false` to promote the channel back to a top-level agent.',
  })
  @ApiOkResponse({
    description: 'Sub-agent flag updated',
    type: AgentResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async setSubagent(@Req() req: RequestWithUser, @Body() dto: SetSubagentDto) {
    return this.agentsService.setSubagent(
      dto.channelId,
      req.user.id,
      dto.isSubagent,
      dto.parentChannelId ?? null,
    );
  }
}
