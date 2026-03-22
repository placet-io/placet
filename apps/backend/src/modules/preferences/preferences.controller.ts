import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ErrorResponse,
  PreferencesResponse,
} from '../../common/swagger-responses';
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
  @ApiOkResponse({ description: 'User preferences', type: PreferencesResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  get(@Req() req: RequestWithUser) {
    return this.preferencesService.get(req.user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update user preferences (theme)' })
  @ApiOkResponse({
    description: 'Preferences updated',
    type: PreferencesResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  update(@Req() req: RequestWithUser, @Body() dto: UpdatePreferencesDto) {
    return this.preferencesService.update(req.user.id, dto);
  }
}
