import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
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

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    channelId: string,
  ) {
    const storageKey = `uploads/${Date.now()}-${filename}`;

    // Upload to S3
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    // Create message + attachment in DB
    const message = await this.prisma.message.create({
      data: {
        channelId,
        senderType: 'agent',
        senderId: channelId,
        text: `Attached: ${filename}`,
      },
    });

    return this.prisma.attachment.create({
      data: {
        messageId: message.id,
        pluginType:
          mimeType.split('/')[0] === 'image' ? '@uax/image' : '@uax/file',
        filename,
        mimeType,
        size: buffer.length,
        storageKey,
      },
    });
  }

  async findAllByUser(
    userId: string,
    query: {
      type?: string;
      agentId?: string;
      search?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    const agents = await this.prisma.agent.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const ownedIds = new Set(agents.map((a) => a.id));

    // If agentId filter is provided, verify the user owns it
    if (query.agentId && !ownedIds.has(query.agentId)) {
      return { data: [], nextCursor: null };
    }

    const agentIds = query.agentId ? [query.agentId] : [...ownedIds];
    const limit = Math.min(query.limit ?? 30, 100);

    const where: Prisma.AttachmentWhereInput = {
      message: { channelId: { in: agentIds } },
      ...(query.type && { mimeType: { startsWith: query.type } }),
      ...(query.search && {
        filename: { contains: query.search, mode: 'insensitive' as const },
      }),
    };

    const items = await this.prisma.attachment.findMany({
      where,
      include: {
        message: {
          select: { channelId: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor && {
        cursor: { id: query.cursor },
        skip: 1,
      }),
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor };
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

  async deleteAttachment(attachmentId: string) {
    const attachment = await this.findAttachmentById(attachmentId);

    // Delete from S3
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: attachment.storageKey,
      }),
    );

    // Delete DB record
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
  }

  async deleteAttachments(attachmentIds: string[]) {
    // Fetch all attachments to get storage keys
    const attachments = await this.prisma.attachment.findMany({
      where: { id: { in: attachmentIds } },
      select: { id: true, storageKey: true },
    });

    if (attachments.length === 0) return;

    // Delete from S3 in batch
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: attachments.map((a) => ({ Key: a.storageKey })),
        },
      }),
    );

    // Delete DB records
    await this.prisma.attachment.deleteMany({
      where: { id: { in: attachments.map((a) => a.id) } },
    });
  }
}
