import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { PreferencesService } from './preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@ApiTags('Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get user preferences' })
  get(@Req() req: RequestWithUser) {
    return this.preferencesService.get(req.user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update user preferences (theme)' })
  update(@Req() req: RequestWithUser, @Body() dto: UpdatePreferencesDto) {
    return this.preferencesService.update(req.user.id, dto);
  }
}
