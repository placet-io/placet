import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
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
import type { RequestWithAgent } from '../../common/types';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';

@ApiTags('Agent API')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('api/v1/messages')
export class MessagesAgentController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Agent: Send a message' })
  @ApiCreatedResponse({
    description: 'Message created',
    type: MessageItemResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  create(@Req() req: RequestWithAgent, @Body() dto: CreateMessageDto) {
    return this.messagesService.createFromAgent(req.agent.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Agent: List messages (chat-as-storage)' })
  @ApiOkResponse({
    description: 'Paginated messages',
    type: PaginatedMessagesResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
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
    @Req() req: RequestWithAgent,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('has_attachments') hasAttachments?: string,
  ) {
    return this.messagesService.findByAgent(req.agent.id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
      search,
      has_attachments:
        hasAttachments !== undefined ? hasAttachments === 'true' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Agent: Get a single message + review status' })
  @ApiOkResponse({ description: 'Message details', type: MessageItemResponse })
  @ApiNotFoundResponse({
    description: 'Message not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  findOne(@Req() req: RequestWithAgent, @Param('id') id: string) {
    return this.messagesService.findOneByAgent(id, req.agent.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Agent: Delete (retract) a message' })
  @ApiOkResponse({ description: 'Message deleted', type: DeletedResponse })
  @ApiNotFoundResponse({
    description: 'Message not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  remove(@Req() req: RequestWithAgent, @Param('id') id: string) {
    return this.messagesService.deleteByAgent(id, req.agent.id);
  }
}
