import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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
import { AgentResponse, ErrorResponse } from '../../common/swagger-responses';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import type { RequestWithUser } from '../../common/types';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { SetWebhookDto, DeleteWebhookDto } from './dto/set-webhook.dto';

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
    return this.agentsService.update(dto.channelId, req.user.id, {
      webhookUrl: dto.url,
      webhookHeaders: dto.headers ?? null,
      webhookAuth: dto.auth ?? null,
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
}
