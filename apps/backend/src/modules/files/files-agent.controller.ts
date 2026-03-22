import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AttachmentResponse,
  ErrorResponse,
  PresignDownloadResponse,
  PresignUploadResponse,
} from '../../common/swagger-responses';
import type { FastifyReply } from 'fastify';
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
  @ApiOkResponse({
    description: 'List of attachments',
    type: [AttachmentResponse],
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  findAll(@Req() req: RequestWithAgent) {
    return this.filesService.findAllByAgent(req.agent.id);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Agent: Get presigned upload URL' })
  @ApiCreatedResponse({
    description: 'Presigned upload URL',
    type: PresignUploadResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  upload(@Body() dto: PresignUploadDto) {
    return this.filesService.presignUpload(dto.filename, dto.mimeType);
  }

  @Get(':id/presign-download')
  @ApiOperation({
    summary: 'Agent: Get presigned download URL by attachment ID',
  })
  @ApiOkResponse({
    description: 'Presigned download URL',
    type: PresignDownloadResponse,
  })
  @ApiNotFoundResponse({
    description: 'Attachment not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async presignDownload(
    @Req() req: RequestWithAgent,
    @Param('id') attachmentId: string,
  ) {
    const attachment = await this.filesService.findAttachmentById(attachmentId);
    if (attachment.message.channelId !== req.agent.id) {
      throw new ForbiddenException('Not your file');
    }
    return this.filesService.presignDownload(attachment.storageKey);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Agent: Download file directly by attachment ID' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'File stream' })
  @ApiNotFoundResponse({
    description: 'Attachment not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async download(
    @Req() req: RequestWithAgent,
    @Res() res: FastifyReply,
    @Param('id') attachmentId: string,
  ) {
    const attachment = await this.filesService.findAttachmentById(attachmentId);
    if (attachment.message.channelId !== req.agent.id) {
      throw new ForbiddenException('Not your file');
    }

    const s3Response = await this.filesService.getFileStream(
      attachment.storageKey,
    );

    const safeFilename = attachment.filename.replace(/["\\\r\n]/g, '_');
    void res.header('Content-Type', attachment.mimeType);
    void res.header(
      'Content-Disposition',
      `inline; filename="${safeFilename}"`,
    );
    if (s3Response.ContentLength) {
      void res.header('Content-Length', String(s3Response.ContentLength));
    }

    if (!s3Response.Body) {
      void res.status(404).send({ message: 'File body empty' });
      return;
    }

    const raw = res.raw;
    const stream = s3Response.Body.transformToWebStream();
    const reader = stream.getReader();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        raw.write(chunk.value as Buffer);
      }
      raw.end();
    } catch {
      reader.cancel().catch(() => {});
      if (!raw.destroyed) raw.destroy();
    }
  }
}
