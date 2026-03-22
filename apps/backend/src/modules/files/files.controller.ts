import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
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
  ApiQuery,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from './files.service';
import { PresignUploadDto } from './dto/presign-upload.dto';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all files across chats' })
  @ApiOkResponse({
    description: 'List of attachments',
    type: [AttachmentResponse],
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by MIME type',
  })
  @ApiQuery({
    name: 'agent',
    required: false,
    description: 'Filter by agent ID',
  })
  findAll(
    @Req() req: RequestWithUser,
    @Query('type') type?: string,
    @Query('agent') agentId?: string,
  ) {
    return this.filesService.findAllByUser(req.user.id, { type, agentId });
  }

  @Post('presign-upload')
  @ApiOperation({ summary: 'Get presigned upload URL' })
  @ApiCreatedResponse({
    description: 'Presigned upload URL',
    type: PresignUploadResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  presignUpload(@Body() dto: PresignUploadDto) {
    return this.filesService.presignUpload(dto.filename, dto.mimeType);
  }

  @Get(':id/presign-download')
  @ApiOperation({ summary: 'Get presigned download URL by attachment ID' })
  @ApiOkResponse({
    description: 'Presigned download URL',
    type: PresignDownloadResponse,
  })
  @ApiNotFoundResponse({
    description: 'Attachment not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async presignDownload(
    @Req() req: RequestWithUser,
    @Param('id') attachmentId: string,
  ) {
    const attachment = await this.filesService.findAttachmentById(attachmentId);
    await this.verifyOwnership(req.user.id, attachment.message.channelId);
    return this.filesService.presignDownload(attachment.storageKey);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download file directly by attachment ID' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'File stream' })
  @ApiNotFoundResponse({
    description: 'Attachment not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async download(
    @Req() req: RequestWithUser,
    @Res({ passthrough: false }) res: FastifyReply,
    @Param('id') attachmentId: string,
  ) {
    const attachment = await this.filesService.findAttachmentById(attachmentId);
    await this.verifyOwnership(req.user.id, attachment.message.channelId);

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

  private async verifyOwnership(userId: string, channelId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your file');
  }
}
