import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { PushService } from './push.service';

class PushSubscribeDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

class PushUnsubscribeDto {
  endpoint: string;
}

@ApiTags('Push')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-key')
  @ApiOperation({ summary: 'Get VAPID public key for push subscription' })
  @ApiOkResponse({ description: 'VAPID public key' })
  getVapidKey() {
    return { publicKey: this.push.getPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register a push subscription' })
  async subscribe(@Req() req: RequestWithUser, @Body() dto: PushSubscribeDto) {
    await this.push.subscribe(req.user.id, dto);
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a push subscription' })
  async unsubscribe(
    @Req() req: RequestWithUser,
    @Body() dto: PushUnsubscribeDto,
  ) {
    await this.push.unsubscribe(req.user.id, dto.endpoint);
  }
}
