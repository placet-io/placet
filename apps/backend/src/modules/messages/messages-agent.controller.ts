import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  DeletedResponse,
  ErrorResponse,
  MessageItemResponse,
  PaginatedMessagesResponse,
} from '../../common/swagger-responses';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import type { RequestWithUser } from '../../common/types';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';

@ApiTags('Messages')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('api/v1/messages')
export class MessagesAgentController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Send a message to a channel (channelId in body)' })
  @ApiCreatedResponse({
    description: 'Message created',
    type: MessageItemResponse,
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  create(@Req() req: RequestWithUser, @Body() dto: CreateMessageDto) {
    return this.messagesService.createFromAgent(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List messages for a channel (chat-as-storage)' })
  @ApiOkResponse({
    description: 'Paginated messages',
    type: PaginatedMessagesResponse,
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'channel',
    required: true,
    description: 'Channel (agent) ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max results (default 50)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Full-text search in message text',
  })
  @ApiQuery({
    name: 'has_attachments',
    required: false,
    description: 'Filter messages with attachments (true/false)',
  })
  findAll(
    @Req() req: RequestWithUser,
    @Query('channel') channel: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('has_attachments') hasAttachments?: string,
  ) {
    return this.messagesService.findByAgent(req.user.id, channel, {
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
      search,
      has_attachments:
        hasAttachments !== undefined ? hasAttachments === 'true' : undefined,
    });
  }

  @Get('iterations/:id')
  @ApiOperation({
    summary: 'Get all messages in an iteration chain',
  })
  @ApiOkResponse({
    description: 'Iteration chain with all messages sorted by iteration',
  })
  @ApiNotFoundResponse({
    description: 'Message not found',
    type: ErrorResponse,
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'channel',
    required: true,
    description: 'Channel (agent) ID',
  })
  getIterationChain(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Query('channel') channel: string,
  ) {
    return this.messagesService.getIterationChain(id, channel, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single message + review status' })
  @ApiOkResponse({ description: 'Message details', type: MessageItemResponse })
  @ApiNotFoundResponse({
    description: 'Message not found',
    type: ErrorResponse,
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'channel',
    required: true,
    description: 'Channel (agent) ID',
  })
  findOne(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Query('channel') channel: string,
  ) {
    return this.messagesService.findOneByAgent(req.user.id, id, channel);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete (retract) a message' })
  @ApiOkResponse({ description: 'Message deleted', type: DeletedResponse })
  @ApiNotFoundResponse({
    description: 'Message not found',
    type: ErrorResponse,
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'channel',
    required: true,
    description: 'Channel (agent) ID',
  })
  remove(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Query('channel') channel: string,
  ) {
    return this.messagesService.deleteByAgent(req.user.id, id, channel);
  }

  @Post(':id/ack')
  @HttpCode(200)
  @ApiOperation({ summary: 'Acknowledge receipt of a message' })
  @ApiOkResponse({
    description: 'Message acknowledged',
    schema: {
      type: 'object',
      properties: { acknowledged: { type: 'boolean', example: true } },
    },
  })
  @ApiNotFoundResponse({
    description: 'Message not found',
    type: ErrorResponse,
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'channel',
    required: true,
    description: 'Channel (agent) ID',
  })
  acknowledge(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Query('channel') channel: string,
  ) {
    return this.messagesService.acknowledgeMessage(req.user.id, id, channel);
  }
}
