import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AttachmentResponse,
  ErrorResponse,
  PresignUploadResponse,
} from '../../common/swagger-responses';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import type { RequestWithAgent } from '../../common/types';
import { FilesService } from './files.service';
import { PresignUploadDto } from './dto/presign-upload.dto';

@ApiTags('Agent API')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('api/v1/files')
export class FilesAgentController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  @ApiOperation({ summary: 'Agent: List all files in chat' })
  @ApiOkResponse({ description: 'List of attachments', type: [AttachmentResponse] })
  @ApiUnauthorizedResponse({ description: 'Invalid API key', type: ErrorResponse })
  findAll(@Req() req: RequestWithAgent) {
    return this.filesService.findAllByAgent(req.agent.id);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Agent: Get presigned upload URL' })
  @ApiCreatedResponse({ description: 'Presigned upload URL', type: PresignUploadResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid API key', type: ErrorResponse })
  upload(@Body() dto: PresignUploadDto) {
    return this.filesService.presignUpload(dto.filename, dto.mimeType);
  }
}
