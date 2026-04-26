import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { DailyUsageService } from '../daily-usage.service';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/manage/usage')
export class ManageDailyUsageController {
  constructor(private readonly service: DailyUsageService) {}

  @Get('daily')
  @ApiOperation({
    summary:
      'Aggregated daily token usage across all owned agents (cached 60s).',
  })
  daily(@Req() req: RequestWithUser, @Query('days') days?: string) {
    const parsed = days ? Number.parseInt(days, 10) : 14;
    return this.service.getDailyUsage(
      req.user.id,
      Number.isFinite(parsed) ? parsed : 14,
    );
  }
}
