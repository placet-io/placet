import {
  BadRequestException,
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
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import type { RequestWithUser } from '../../common/types';
import { FilesService } from './files.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Agent API')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('api/v1/files')
export class FilesAgentController {
  constructor(
    private readonly filesService: FilesService,
    private readonly prisma: PrismaService,
  ) {}

  private async verifyOwnership(userId: string, channelId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
    });
    if (!agent) throw new ForbiddenException('Not your agent');
  }

  @Get()
  @ApiOperation({ summary: 'List all files in a channel' })
  @ApiOkResponse({
    description: 'List of attachments',
    type: [AttachmentResponse],
  })
  @ApiForbiddenResponse({ description: 'Not your agent', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'channel',
    required: true,
    description: 'Channel (agent) ID',
  })
  async findAll(
    @Req() req: RequestWithUser,
    @Query('channel') channel: string,
  ) {
    await this.verifyOwnership(req.user.id, channel);
    return this.filesService.findAllByAgent(channel);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({
    description: 'Uploaded attachment',
    type: AttachmentResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async upload(@Req() req: RequestWithUser & FastifyRequest) {
    const data = await req.file();
    if (!data) throw new BadRequestException('No file provided');

    const channelId = (data.fields['channelId'] as { value?: string })?.value;
    if (!channelId) throw new BadRequestException('channelId is required');

    await this.verifyOwnership(req.user.id, channelId);

    const buffer = await data.toBuffer();
    return this.filesService.uploadFile(
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
  @ApiForbiddenResponse({ description: 'Not your file', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid API key',
    type: ErrorResponse,
  })
  async download(
    @Req() req: RequestWithUser,
    @Res() res: FastifyReply,
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

    const bytes = await s3Response.Body.transformToByteArray();
    void res.send(Buffer.from(bytes));
  }
}
