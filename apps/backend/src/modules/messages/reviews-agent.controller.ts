import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import type { RequestWithAgent } from '../../common/types';
import { MessagesService } from './messages.service';

@ApiTags('Agent API')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('api/v1/reviews')
export class ReviewsAgentController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Agent: List all pending reviews' })
  getPending(@Req() req: RequestWithAgent) {
    return this.messagesService.getPendingReviewsByAgent(req.agent.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Agent: Get a specific review by message ID' })
  getReview(@Req() req: RequestWithAgent, @Param('id') id: string) {
    return this.messagesService.getReviewByAgent(id, req.agent.id);
  }

  @Get(':id/wait')
  @ApiOperation({
    summary: 'Agent: Long-poll for review response (max 30s)',
  })
  @ApiQuery({
    name: 'timeout',
    required: false,
    description: 'Timeout in ms (default 30000, max 30000)',
  })
  waitForResponse(
    @Req() req: RequestWithAgent,
    @Param('id') id: string,
    @Query('timeout') timeout?: string,
  ) {
    const parsed = timeout ? parseInt(timeout, 10) : 30000;
    const timeoutMs =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30000) : 30000;
    return this.messagesService.waitForReviewResponse(
      id,
      req.agent.id,
      timeoutMs,
    );
  }
}
