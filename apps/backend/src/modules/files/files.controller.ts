import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
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
} from '../../common/swagger-responses';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from './files.service';

@ApiTags('Files', 'Frontend')
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
    description: 'Paginated list of attachments',
    type: [AttachmentResponse],
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by MIME type prefix',
  })
  @ApiQuery({
    name: 'agent',
    required: false,
    description: 'Filter by agent ID',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by filename',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size (max 100)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor for pagination',
  })
  findAll(
    @Req() req: RequestWithUser,
    @Query('type') type?: string,
    @Query('agent') agentId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.filesService.findAllByUser(req.user.id, {
      type,
      agentId,
      search,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({
    description: 'Uploaded attachment',
    type: AttachmentResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async upload(@Req() req: RequestWithUser & FastifyRequest) {
    const data = await req.file();
    if (!data) throw new BadRequestException('No file provided');

    const channelId = (data.fields['channelId'] as { value?: string })?.value;
    if (!channelId) throw new BadRequestException('channelId is required');
    const text = (data.fields['text'] as { value?: string })?.value;

    await this.verifyOwnership(req.user.id, channelId);

    const buffer = await data.toBuffer();
    return this.filesService.uploadFile(
      buffer,
      data.filename,
      data.mimetype,
      channelId,
      'user',
      req.user.id,
      text || undefined,
    );
  }

  @Post('store')
  @ApiOperation({ summary: 'Store a file without creating a chat message' })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({
    description: 'Stored attachment (orphan)',
    type: AttachmentResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async store(@Req() req: RequestWithUser & FastifyRequest) {
    const data = await req.file();
    if (!data) throw new BadRequestException('No file provided');

    const channelId = (data.fields['channelId'] as { value?: string })?.value;
    if (!channelId) throw new BadRequestException('channelId is required');

    await this.verifyOwnership(req.user.id, channelId);

    const buffer = await data.toBuffer();
    return this.filesService.storeFile(
      buffer,
      data.filename,
      data.mimetype,
      channelId,
    );
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
    await this.verifyOwnership(req.user.id, attachment.channelId);

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

    const bytes = await s3Response.Body.transformToByteArray();
    void res.send(Buffer.from(bytes));
  }

  @Get(':id/share')
  @ApiOperation({ summary: 'Get presigned download URL for sharing' })
  @ApiOkResponse({ description: 'Presigned URL with expiry' })
  @ApiNotFoundResponse({
    description: 'Attachment not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async share(@Req() req: RequestWithUser, @Param('id') attachmentId: string) {
    const attachment = await this.filesService.findAttachmentById(attachmentId);
    await this.verifyOwnership(req.user.id, attachment.channelId);
    return this.filesService.createShareToken(attachmentId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file' })
  @ApiOkResponse({ description: 'File deleted' })
  @ApiNotFoundResponse({
    description: 'Attachment not found',
    type: ErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async deleteFile(
    @Req() req: RequestWithUser,
    @Param('id') attachmentId: string,
  ) {
    const attachment = await this.filesService.findAttachmentById(attachmentId);
    await this.verifyOwnership(req.user.id, attachment.channelId);
    await this.filesService.deleteAttachment(attachmentId);
    return { message: 'Deleted' };
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple files' })
  @ApiOkResponse({ description: 'Files deleted' })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async bulkDelete(
    @Req() req: RequestWithUser,
    @Body() body: { ids: string[] },
  ) {
    // Verify ownership for all files
    const attachments = await this.prisma.attachment.findMany({
      where: { id: { in: body.ids } },
      select: { channelId: true },
    });
    const channelIds = [...new Set(attachments.map((a) => a.channelId))];
    for (const channelId of channelIds) {
      await this.verifyOwnership(req.user.id, channelId);
    }
    await this.filesService.deleteAttachments(body.ids);
    return { message: `Deleted ${attachments.length} file(s)` };
  }

  @Post('bulk-download')
  @HttpCode(200)
  @ApiOperation({ summary: 'Download multiple files as ZIP' })
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'ZIP file stream' })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  async bulkDownload(
    @Req() req: RequestWithUser,
    @Res({ passthrough: false }) res: FastifyReply,
    @Body() body: { ids: string[] },
  ) {
    const attachments = await this.prisma.attachment.findMany({
      where: { id: { in: body.ids } },
      select: { channelId: true },
    });
    const channelIds = [...new Set(attachments.map((a) => a.channelId))];
    for (const channelId of channelIds) {
      await this.verifyOwnership(req.user.id, channelId);
    }

    const { buffer } = await this.filesService.createZip(body.ids);

    void res.header('Content-Type', 'application/zip');
    void res.header('Content-Disposition', 'attachment; filename="files.zip"');
    void res.header('Content-Length', String(buffer.length));
    void res.send(buffer);
  }

  private async verifyOwnership(userId: string, channelId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your file');
  }
}
