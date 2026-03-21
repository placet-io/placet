import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });
    return prefs ?? { userId, theme: 'system' };
  }

  async update(userId: string, data: { theme?: string }) {
    return this.prisma.userPreferences.upsert({
      where: { userId },
      update: { ...(data.theme && { theme: data.theme }) },
      create: { userId, theme: data.theme ?? 'system' },
    });
  }
}
