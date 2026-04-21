import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { OAuthRelayService } from './oauth-relay.service';
import { EventsGateway } from '../events/events.gateway';

/**
 * Public callback endpoint for OAuth Authorization Code flows relayed through
 * Placet.  The external OAuth provider redirects here after the user grants
 * access.  Placet resolves the state parameter to the originating channel and
 * emits the authorization code back via Socket.IO.
 *
 * @experimental This module is experimental and may change without notice.
 */
@ApiExcludeController()
@Controller('api/v1/oauth')
export class OAuthRelayController {
  private readonly logger = new Logger(OAuthRelayController.name);

  constructor(
    private readonly oauthRelay: OAuthRelayService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Get('callback')
  handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    // If the provider returned an error, emit it and show a failure page.
    if (error) {
      if (state) {
        const flow = this.oauthRelay.consume(state);
        if (flow) {
          this.eventsGateway.emitToChannel(flow.channelId, 'oauth:error', {
            state,
            error,
            errorDescription: errorDescription ?? null,
            provider: flow.provider,
          });
        }
      }
      this.logger.warn(`OAuth callback error: ${error} — ${errorDescription}`);
      return reply.type('text/html').send(this.renderHtml(false, error));
    }

    if (!state || !code) {
      this.logger.warn('OAuth callback missing state or code');
      return reply
        .status(400)
        .type('text/html')
        .send(this.renderHtml(false, 'Missing state or code parameter'));
    }

    const flow = this.oauthRelay.consume(state);
    if (!flow) {
      this.logger.warn(
        `OAuth callback unknown/expired state: ${state.slice(0, 8)}…`,
      );
      return reply
        .status(400)
        .type('text/html')
        .send(
          this.renderHtml(
            false,
            'OAuth session expired or invalid. Please try again.',
          ),
        );
    }

    // Relay the authorization code to the agent via Socket.IO
    this.eventsGateway.emitToChannel(flow.channelId, 'oauth:code', {
      state,
      code,
      provider: flow.provider,
    });

    this.logger.log(
      `OAuth code relayed: provider=${flow.provider} channel=${flow.channelId}`,
    );

    return reply.type('text/html').send(this.renderHtml(true));
  }

  private renderHtml(success: boolean, error?: string): string {
    const title = success ? 'Authorization Successful' : 'Authorization Failed';
    const message = success
      ? 'You can close this window and return to your application.'
      : `Something went wrong: ${error ?? 'Unknown error'}. You can close this window and try again.`;
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{text-align:center;padding:2rem;border-radius:8px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.1);max-width:400px}
h1{margin:0 0 .5rem;font-size:1.5rem;color:${success ? '#16a34a' : '#dc2626'}}
p{color:#555;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
  }
}
