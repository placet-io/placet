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
  CreateAgentResponse,
  DeletedResponse,
  ErrorResponse,
  RotateKeyResponse,
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
  @ApiOperation({ summary: 'List my agents (with online status)' })
  @ApiOkResponse({ description: 'List of agents', type: [AgentResponse] })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  findAll(@Req() req: RequestWithUser) {
    return this.agentsService.findAllByOwner(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new agent (returns API key once)' })
  @ApiCreatedResponse({
    description: 'Agent created with API key',
    type: CreateAgentResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  create(@Req() req: RequestWithUser, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an agent' })
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
  @ApiOperation({ summary: 'Delete an agent' })
  @ApiOkResponse({ description: 'Agent deleted', type: DeletedResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.remove(id, req.user.id);
  }

  @Post(':id/rotate-key')
  @ApiOperation({ summary: 'Rotate agent API key (returns new key once)' })
  @ApiCreatedResponse({
    description: 'New API key generated',
    type: RotateKeyResponse,
  })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  rotateKey(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.rotateKey(id, req.user.id);
  }
}
