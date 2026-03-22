import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FilesService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'humanproxy');

    const host = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = this.config.get<string>('MINIO_PORT', '9000');
    const endpoint = host.startsWith('http') ? host : `http://${host}:${port}`;

    this.s3 = new S3Client({
      endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.config.get<string>(
          'MINIO_SECRET_KEY',
          'minioadmin',
        ),
      },
      forcePathStyle: true,
    });
  }

  async presignUpload(filename: string, mimeType: string) {
    const key = `uploads/${Date.now()}-${filename}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn: 3600 });
    return { url, storageKey: key };
  }

  async presignDownload(storageKey: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn: 3600 });
    return { url };
  }

  async findAllByUser(
    userId: string,
    query: { type?: string; agentId?: string },
  ) {
    const agents = await this.prisma.agent.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const ownedIds = new Set(agents.map((a) => a.id));

    // If agentId filter is provided, verify the user owns it
    if (query.agentId && !ownedIds.has(query.agentId)) {
      return [];
    }

    const agentIds = query.agentId ? [query.agentId] : [...ownedIds];

    const where: Prisma.AttachmentWhereInput = {
      message: { channelId: { in: agentIds } },
      ...(query.type && { mimeType: { startsWith: query.type } }),
    };

    return this.prisma.attachment.findMany({
      where,
      include: {
        message: {
          select: { channelId: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllByAgent(agentId: string) {
    return this.prisma.attachment.findMany({
      where: { message: { channelId: agentId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAttachmentById(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { channelId: true } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }

  async getFileStream(storageKey: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    const response = await this.s3.send(command);
    return response;
  }

  async presignDownloadById(attachmentId: string) {
    const attachment = await this.findAttachmentById(attachmentId);
    return this.presignDownload(attachment.storageKey);
  }
}
