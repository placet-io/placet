import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
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

  @Get('stats')
  @ApiOperation({ summary: 'Get global agent statistics' })
  @ApiOkResponse({ description: 'Global statistics across all agents' })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  getGlobalStats(@Req() req: RequestWithUser) {
    return this.agentsService.getGlobalStats(req.user.id);
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

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a chat as read' })
  @ApiOkResponse({ description: 'Marked as read' })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  markRead(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.markRead(id, req.user.id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get agent statistics (messages, errors, uptime)' })
  @ApiOkResponse({ description: 'Agent statistics' })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  getStats(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.getStats(id, req.user.id);
  }

  @Post(':id/avatar')
  @ApiOperation({ summary: 'Upload agent avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Agent updated', type: AgentResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ErrorResponse })
  async uploadAvatar(
    @Req() req: RequestWithUser & FastifyRequest,
    @Param('id') id: string,
  ) {
    const data = await req.file();
    if (!data) throw new BadRequestException('No file provided');
    if (!data.mimetype.startsWith('image/'))
      throw new BadRequestException('File must be an image');

    const buffer = await data.toBuffer();
    return this.agentsService.uploadAvatar(
      id,
      req.user.id,
      buffer,
      data.mimetype,
    );
  }

  @Get(':id/avatar')
  @ApiOperation({ summary: 'Get agent avatar image' })
  @ApiOkResponse({ description: 'Avatar image' })
  @ApiNotFoundResponse({
    description: 'Agent not found or no avatar',
    type: ErrorResponse,
  })
  async getAvatar(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const s3Resp = await this.agentsService.getAvatarStream(id, req.user.id);
    const contentType = s3Resp.ContentType ?? 'application/octet-stream';
    void reply.header('Content-Type', contentType);
    void reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(s3Resp.Body);
  }

  @Delete(':id/avatar')
  @ApiOperation({ summary: 'Remove agent avatar' })
  @ApiOkResponse({ description: 'Agent updated', type: AgentResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ErrorResponse })
  removeAvatar(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.agentsService.removeAvatar(id, req.user.id);
  }
}
