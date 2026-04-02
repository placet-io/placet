import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
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
  ErrorResponse,
  MessageItemResponse,
  ReviewWaitResponse,
} from '../../common/swagger-responses';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import type { RequestWithUser } from '../../common/types';
import { MessagesService } from './messages.service';

@ApiTags('Reviews')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('api/v1/reviews')
export class ReviewsAgentController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List all pending reviews for a channel' })
  @ApiOkResponse({
    description: 'List of messages with pending reviews',
    type: [MessageItemResponse],
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
  getPending(@Req() req: RequestWithUser, @Query('channel') channel: string) {
    return this.messagesService.getPendingReviewsByAgent(req.user.id, channel);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific review by message ID' })
  @ApiOkResponse({
    description: 'Message with review',
    type: MessageItemResponse,
  })
  @ApiNotFoundResponse({
    description: 'Message or review not found',
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
  getReview(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Query('channel') channel: string,
  ) {
    return this.messagesService.getReviewByAgent(req.user.id, id, channel);
  }

  @Get(':id/wait')
  @ApiOperation({
    summary: 'Long-poll for review response (max 30s)',
  })
  @ApiOkResponse({
    description: 'Review completed or timeout',
    type: ReviewWaitResponse,
  })
  @ApiNotFoundResponse({
    description: 'Message or review not found',
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
  @ApiQuery({
    name: 'timeout',
    required: false,
    description: 'Timeout in ms (default 30000, max 30000)',
  })
  waitForResponse(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Query('channel') channel: string,
    @Query('timeout') timeout?: string,
  ) {
    const parsed = timeout ? parseInt(timeout, 10) : 30000;
    const timeoutMs =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30000) : 30000;
    return this.messagesService.waitForReviewResponse(
      req.user.id,
      id,
      channel,
      timeoutMs,
    );
  }
}
