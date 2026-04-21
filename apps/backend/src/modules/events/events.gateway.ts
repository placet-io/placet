import { Inject, Logger, forwardRef } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthRelayService } from '../oauth-relay/oauth-relay.service';

function resolveWsCors(): { origin: string | string[] | boolean } {
  const env = process.env.NODE_ENV;
  if (env !== 'production') {
    return { origin: true };
  }
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin || corsOrigin === '*') {
    return { origin: true };
  }
  return { origin: corsOrigin.split(',') };
}

@WebSocketGateway({
  cors: resolveWsCors(),
  namespace: '/ws',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OAuthRelayService))
    private readonly oauthRelay: OAuthRelayService,
  ) {}

  afterInit(server: Server) {
    // Authenticate BEFORE the connection is accepted so that `client.data.userId`
    // is guaranteed to be set before any event handler runs. Without this,
    // handlers like `subscribe:channel` could race with the async API-key DB
    // lookup and silently drop room joins.
    server.use((socket, next) => {
      const auth = socket.handshake.auth ?? {};
      const token = auth.token as string | undefined;
      const apiKey = auth.apiKey as string | undefined;

      if (apiKey) {
        this.resolveApiKey(apiKey)
          .then((userId) => {
            if (!userId) {
              return next(new Error('unauthorized'));
            }
            (socket.data as Record<string, unknown>).userId = userId;
            (socket.data as Record<string, unknown>).authMethod = 'apiKey';
            next();
          })
          .catch(() => next(new Error('unauthorized')));
        return;
      }

      if (!token) {
        return next(new Error('unauthorized'));
      }

      try {
        const payload = this.jwtService.verify<{ sub: string }>(token);
        (socket.data as Record<string, unknown>).userId = payload.sub;
        (socket.data as Record<string, unknown>).authMethod = 'jwt';
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    const data = client.data as Record<string, unknown>;
    const userId = data.userId as string | undefined;
    const authMethod = data.authMethod as string | undefined;

    if (!userId) {
      // Should never happen — middleware rejects unauth'd sockets.
      this.logger.warn(`WS connection without userId (${client.id})`);
      client.disconnect(true);
      return;
    }

    if (authMethod === 'jwt') {
      void client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } else {
      // API-key connections do NOT join the user room. The user room is for
      // frontend clients (cross-channel notifications, unread badges etc.).
      // Agents subscribe explicitly to their channel room via
      // subscribe:channel. Joining both rooms causes every message:created
      // event to be delivered twice — once per room — which leads to
      // duplicate processing.
      this.logger.log(
        `Client connected via API key: ${client.id} (user: ${userId})`,
      );
    }
  }

  private async resolveApiKey(rawKey: string): Promise<string | null> {
    if (!rawKey.startsWith('hp_')) return null;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      select: { userId: true },
    });
    return apiKey?.userId ?? null;
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Client-initiated subscriptions ─────────────────────────

  @SubscribeMessage('subscribe:channel')
  async handleSubscribe(client: Socket, channelId: string) {
    const userId = (client.data as Record<string, unknown>).userId as
      | string
      | undefined;
    if (!userId) return;

    // Verify user owns the agent before allowing subscription
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
      select: { id: true },
    });
    if (!agent) return;

    void client.join(`channel:${channelId}`);
  }

  @SubscribeMessage('unsubscribe:channel')
  handleUnsubscribe(client: Socket, channelId: string) {
    void client.leave(`channel:${channelId}`);
  }

  @SubscribeMessage('channel:read')
  async handleChannelRead(client: Socket, channelId: string) {
    const userId = (client.data as Record<string, unknown>).userId as
      | string
      | undefined;
    if (!userId) return;

    // Verify ownership
    const agent = await this.prisma.agent.findFirst({
      where: { id: channelId, ownerId: userId },
      select: { id: true },
    });
    if (!agent) return;

    await this.prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt: new Date() },
      create: { userId, channelId },
    });
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    client.emit('pong');
  }

  // ── Agent-initiated events (forwarded to channel subscribers) ──

  @SubscribeMessage('message:delta')
  handleMessageDelta(
    client: Socket,
    data: {
      channelId: string;
      delta: string;
      streamId?: string;
      streamEnd?: boolean;
    },
  ) {
    if (!data?.channelId) return;
    this.server.to(`channel:${data.channelId}`).emit('message:delta', data);
  }

  @SubscribeMessage('message:progress')
  handleMessageProgress(
    client: Socket,
    data: { channelId: string; content: string; toolHint?: boolean },
  ) {
    if (!data?.channelId) return;
    this.server.to(`channel:${data.channelId}`).emit('message:progress', data);
  }

  @SubscribeMessage('agent:commands')
  handleAgentCommands(
    client: Socket,
    data: { channelId: string; commands: unknown[] },
  ) {
    if (!data?.channelId) return;
    this.server.to(`channel:${data.channelId}`).emit('agent:commands', data);
  }

  // ── OAuth relay events ──────────────────────────────────

  @SubscribeMessage('oauth:start')
  async handleOAuthStart(
    client: Socket,
    data: {
      channelId: string;
      state: string;
      provider: string;
      authUrl?: string;
      deviceCode?: {
        verificationUri: string;
        userCode: string;
        expiresIn?: number;
      };
    },
  ) {
    if (!data?.channelId || !data?.state || !data?.provider) return;

    const userId = (client.data as Record<string, unknown>).userId as
      | string
      | undefined;
    if (!userId) return;

    // Verify channel ownership
    const agent = await this.prisma.agent.findFirst({
      where: { id: data.channelId, ownerId: userId },
      select: { id: true },
    });
    if (!agent) return;

    // Register state for auth code callback resolution
    if (data.authUrl) {
      this.oauthRelay.register(data.state, data.channelId, data.provider);
    }

    // Forward to the user's frontend (user room)
    this.emitToUser(userId, 'oauth:start', {
      channelId: data.channelId,
      state: data.state,
      provider: data.provider,
      authUrl: data.authUrl ?? null,
      deviceCode: data.deviceCode ?? null,
    });
  }

  // ── Server-side emit helpers ───────────────────────────────

  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
