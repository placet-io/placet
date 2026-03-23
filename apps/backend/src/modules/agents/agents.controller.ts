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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AgentResponse,
  DeletedResponse,
  ErrorResponse,
} from '../../common/swagger-responses';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @ApiOperation({ summary: 'List my chats (agents)' })
  @ApiOkResponse({ description: 'List of agents', type: [AgentResponse] })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  findAll(@Req() req: RequestWithUser) {
    return this.agentsService.findAllByOwner(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new chat (agent)' })
  @ApiCreatedResponse({
    description: 'Agent created',
    type: AgentResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  create(@Req() req: RequestWithUser, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a chat (agent)' })
  @ApiOkResponse({ description: 'Agent updated', type: AgentResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a chat (agent)' })
  @ApiOkResponse({ description: 'Agent deleted', type: DeletedResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.remove(id, req.user.id);
  }
}
