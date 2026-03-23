import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DeletedResponse, ErrorResponse } from '../../common/swagger-responses';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List my API keys' })
  @ApiOkResponse({ description: 'List of API keys (without secrets)' })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  findAll(@Req() req: RequestWithUser) {
    return this.apiKeysService.findAllByUser(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new API key (key shown only once)' })
  @ApiCreatedResponse({ description: 'API key created' })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  create(@Req() req: RequestWithUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.create(req.user.id, dto.label);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an API key' })
  @ApiOkResponse({ description: 'API key deleted', type: DeletedResponse })
  @ApiNotFoundResponse({
    description: 'API key not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.apiKeysService.remove(id, req.user.id);
  }

  @Post(':id/rotate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate an API key (atomically replace with new key)',
  })
  @ApiOkResponse({ description: 'New API key generated (shown only once)' })
  @ApiNotFoundResponse({
    description: 'API key not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  rotate(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.apiKeysService.rotate(id, req.user.id);
  }
}
