import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });
    return prefs ?? { userId, theme: 'system', managementDashboard: false };
  }

  async update(
    userId: string,
    data: { theme?: string; managementDashboard?: boolean },
  ) {
    return this.prisma.userPreferences.upsert({
      where: { userId },
      update: {
        ...(data.theme && { theme: data.theme }),
        ...(data.managementDashboard !== undefined && {
          managementDashboard: data.managementDashboard,
        }),
      },
      create: {
        userId,
        theme: data.theme ?? 'system',
        managementDashboard: data.managementDashboard ?? false,
      },
    });
  }
}
