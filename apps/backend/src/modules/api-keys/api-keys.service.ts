import { Injectable, NotFoundException } from '@nestjs/common';
import { generateApiKey } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';

const API_KEY_SELECT = {
  id: true,
  userId: true,
  label: true,
  keyPrefix: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      select: API_KEY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, label?: string) {
    const { rawKey, hash, prefix } = generateApiKey();

    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId,
        label: label || 'Default',
        keyHash: hash,
        keyPrefix: prefix,
      },
      select: API_KEY_SELECT,
    });

    return { ...apiKey, key: rawKey };
  }

  async remove(id: string, userId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, userId },
    });
    if (!key) throw new NotFoundException('API key not found');

    await this.prisma.apiKey.delete({ where: { id } });
    return { deleted: true };
  }

  async rotate(id: string, userId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, userId },
    });
    if (!key) throw new NotFoundException('API key not found');

    const { rawKey, hash, prefix } = generateApiKey();

    // Atomic: update the existing row with new hash/prefix
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        keyHash: hash,
        keyPrefix: prefix,
        lastUsedAt: null,
      },
      select: API_KEY_SELECT,
    });

    return { ...updated, key: rawKey };
  }
}
