import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { FilesService } from '../files/files.service';

@ApiTags('Share')
@Controller('api/share')
export class ShareController {
  constructor(private readonly filesService: FilesService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Download a shared file (no auth required)' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'File stream' })
  @ApiNotFoundResponse({ description: 'Invalid or expired share link' })
  async downloadShared(
    @Param('token') token: string,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    let attachment: Awaited<
      ReturnType<typeof this.filesService.getAttachmentByShareToken>
    >;
    try {
      attachment = await this.filesService.getAttachmentByShareToken(token);
    } catch {
      throw new NotFoundException('Invalid or expired share link');
    }

    const s3Response = await this.filesService.getFileStream(
      attachment.storageKey,
    );

    if (!s3Response.Body) {
      void res.status(404).send({ message: 'File body empty' });
      return;
    }

    const safeFilename = attachment.filename.replace(/["\\\r\n]/g, '_');
    void res.header('Content-Type', attachment.mimeType);
    void res.header(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"`,
    );
    if (s3Response.ContentLength) {
      void res.header('Content-Length', String(s3Response.ContentLength));
    }

    const bytes = await s3Response.Body.transformToByteArray();
    void res.send(Buffer.from(bytes));
  }
}
