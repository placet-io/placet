import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { MessagesService } from './messages.service';
import { CreateUserMessageDto } from './dto/create-user-message.dto';
import { RespondReviewDto } from './dto/respond-review.dto';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get messages for a channel (agent)' })
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
  @ApiOperation({ summary: 'Get all pending reviews across agents' })
  getPendingReviews(@Req() req: RequestWithUser) {
    return this.messagesService.getPendingReviews(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'User sends a message to an agent channel' })
  create(@Req() req: RequestWithUser, @Body() dto: CreateUserMessageDto) {
    return this.messagesService.createFromUser(
      req.user.id,
      dto.channelId,
      dto.text,
    );
  }

  @Post(':id/respond')
  @ApiOperation({ summary: 'User responds to a review' })
  respond(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: RespondReviewDto,
  ) {
    return this.messagesService.respondToReview(id, req.user.id, dto);
  }
}
