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
  findAll(@Req() req: RequestWithUser) {
    return this.agentsService.findAllByOwner(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new agent (returns API key once)' })
  create(@Req() req: RequestWithUser, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an agent' })
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agent' })
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.remove(id, req.user.id);
  }

  @Post(':id/rotate-key')
  @ApiOperation({ summary: 'Rotate agent API key (returns new key once)' })
  rotateKey(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.rotateKey(id, req.user.id);
  }
}
