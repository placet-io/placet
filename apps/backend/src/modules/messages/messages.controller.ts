import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ErrorResponse,
  MessageItemResponse,
  PaginatedMessagesResponse,
} from '../../common/swagger-responses';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { MessagesService } from './messages.service';
import { CreateUserMessageDto } from './dto/create-user-message.dto';
import { RespondReviewDto } from './dto/respond-review.dto';

@ApiTags('Messages', 'Frontend')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get messages for a channel (agent)' })
  @ApiOkResponse({
    description: 'Paginated messages',
    type: PaginatedMessagesResponse,
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'channel',
    required: true,
    description: 'Agent/channel ID',
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
  findByChannel(
    @Req() req: RequestWithUser,
    @Query('channel') channel: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messagesService.findByChannel(channel, req.user.id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Get reviews across agents' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'completed', 'expired', 'all'],
    description: 'Filter by review status (default: pending)',
  })
  @ApiOkResponse({
    description: 'List of messages with reviews',
    type: [MessageItemResponse],
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  getReviews(@Req() req: RequestWithUser, @Query('status') status?: string) {
    return this.messagesService.getReviews(req.user.id, status);
  }

  @Post()
  @ApiOperation({ summary: 'User sends a message to an agent channel' })
  @ApiCreatedResponse({
    description: 'Message created',
    type: MessageItemResponse,
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  create(@Req() req: RequestWithUser, @Body() dto: CreateUserMessageDto) {
    return this.messagesService.createFromUser(
      req.user.id,
      dto.channelId,
      dto.text,
      dto.attachmentIds,
    );
  }

  @Post(':id/respond')
  @ApiOperation({ summary: 'User responds to a review' })
  @ApiCreatedResponse({
    description: 'Review response recorded',
    type: MessageItemResponse,
  })
  @ApiNotFoundResponse({
    description: 'Message or review not found',
    type: ErrorResponse,
  })
  @ApiForbiddenResponse({
    description: 'Not your agent / Review already responded',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  respond(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: RespondReviewDto,
  ) {
    return this.messagesService.respondToReview(id, req.user.id, dto);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retry failed webhook delivery for a message' })
  @ApiOkResponse({
    description: 'Webhook delivery retried',
    schema: {
      type: 'object',
      properties: { retried: { type: 'boolean', example: true } },
    },
  })
  @ApiNotFoundResponse({
    description: 'Message not found',
    type: ErrorResponse,
  })
  @ApiForbiddenResponse({
    description: 'Not your agent / Cannot retry',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  retryDelivery(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.messagesService.retryWebhookDelivery(id, req.user.id);
  }
}
