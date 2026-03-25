import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import archiver from 'archiver';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../providers/s3.service';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly s3: S3Service,
  ) {}

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    channelId: string,
    senderType: 'agent' | 'user' = 'agent',
    senderId?: string,
    text?: string,
  ) {
    const storageKey = `uploads/${Date.now()}-${filename}`;

    // Upload to S3
    await this.s3.upload(storageKey, buffer, mimeType);

    // Create message + attachment in DB
    const message = await this.prisma.message.create({
      data: {
        channelId,
        senderType,
        senderId: senderId ?? channelId,
        ...(text ? { text } : {}),
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
    return this.s3.getStream(storageKey);
  }

  /** Default share-token expiry: 1 hour */
  private static readonly SHARE_EXPIRES_IN = 3600;

  createShareToken(attachmentId: string): { url: string; expiresIn: number } {
    const jwt = this.jwt.sign(
      { sub: attachmentId, purpose: 'file-share' },
      { expiresIn: FilesService.SHARE_EXPIRES_IN },
    );
    const token = Buffer.from(jwt).toString('base64url');
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3001');
    const url = `${appUrl}/api/share/${token}`;
    return { url, expiresIn: FilesService.SHARE_EXPIRES_IN };
  }

  async getAttachmentByShareToken(token: string) {
    const jwt = Buffer.from(token, 'base64url').toString();
    const payload = this.jwt.verify<{ sub: string; purpose: string }>(jwt);
    if (payload.purpose !== 'file-share') {
      throw new NotFoundException('Invalid share token');
    }
    return this.findAttachmentById(payload.sub);
  }

  async deleteAttachment(attachmentId: string) {
    const attachment = await this.findAttachmentById(attachmentId);

    // Delete from S3
    await this.s3.delete(attachment.storageKey);

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
    await this.s3.deleteMany(attachments.map((a) => a.storageKey));

    // Delete DB records
    await this.prisma.attachment.deleteMany({
      where: { id: { in: attachments.map((a) => a.id) } },
    });
  }

  async createZip(
    attachmentIds: string[],
  ): Promise<{ buffer: Buffer; count: number }> {
    const attachments = await this.prisma.attachment.findMany({
      where: { id: { in: attachmentIds } },
      select: { filename: true, storageKey: true },
    });

    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks: Buffer[] = [];

    const done = new Promise<void>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', resolve);
      archive.on('error', reject);
    });

    for (const att of attachments) {
      const s3Resp = await this.getFileStream(att.storageKey);
      if (s3Resp.Body) {
        const bytes = await s3Resp.Body.transformToByteArray();
        archive.append(Buffer.from(bytes), { name: att.filename });
      }
    }

    await archive.finalize();
    await done;

    return { buffer: Buffer.concat(chunks), count: attachments.length };
  }
}
