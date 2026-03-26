import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>(
      'VAPID_SUBJECT',
      'mailto:admin@humanproxy.local',
    );

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys not configured — push notifications disabled. ' +
          'Generate keys with: npx web-push generate-vapid-keys',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.enabled = true;
    this.logger.log('Web push notifications enabled');
  }

  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  async subscribe(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; channelId: string },
  ) {
    if (!this.enabled) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    const staleIds: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404 or 410 = subscription expired / unsubscribed
          if (status === 404 || status === 410) {
            staleIds.push(sub.id);
          } else {
            this.logger.warn(
              `Push failed for ${sub.endpoint.slice(0, 60)}… : ${String(err)}`,
            );
          }
        }
      }),
    );

    // Clean up stale subscriptions
    if (staleIds.length) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: staleIds } },
      });
    }
  }
}
