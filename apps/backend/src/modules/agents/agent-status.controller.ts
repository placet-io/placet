import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
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
import { EventsGateway } from '../events/events.gateway';
import { PingStatusDto } from './dto/ping-status.dto';

@ApiTags('Status')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('api/v1/status')
export class AgentStatusController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Post('ping')
  @ApiOperation({ summary: 'Report agent status (heartbeat)' })
  @ApiOkResponse({ description: 'Status updated', type: AgentResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async ping(@Req() req: RequestWithUser, @Body() dto: PingStatusDto) {
    const agent = await this.agentsService.pingStatus(
      dto.agentId,
      req.user.id,
      dto.status,
      dto.message,
    );

    // Notify the owner via WebSocket
    this.eventsGateway.emitToUser(req.user.id, 'agent:status', {
      agentId: agent.id,
      status: agent.status,
      statusMessage: agent.statusMessage,
      statusSince: agent.statusSince,
    });

    return agent;
  }
}
