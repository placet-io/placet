import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import type { RequestWithAgent } from '../../common/types';
import { FilesService } from './files.service';

@ApiTags('Agent API')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('api/v1/files')
export class FilesAgentController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  @ApiOperation({ summary: 'Agent: List all files in chat' })
  findAll(@Req() req: RequestWithAgent) {
    return this.filesService.findAllByAgent(req.agent.id);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Agent: Get presigned upload URL' })
  upload(@Body() body: { filename: string; mimeType: string }) {
    return this.filesService.presignUpload(body.filename, body.mimeType);
  }
}
