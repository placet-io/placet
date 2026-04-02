import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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
}
