// ---------------------------------------------------------------------------
// Placet MCP Server – Review Tools
// ---------------------------------------------------------------------------
// Implements the fire-and-poll pattern for long-running human reviews.
// The AI agent calls send_review_message (fire) then wait_for_review (poll).
// wait_for_review loops over the backend's 30s long-poll endpoint and sends
// MCP progress notifications to keep the connection alive.
// ---------------------------------------------------------------------------

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlacetApiClient, WaitResult } from '../api/client.js';
import type { McpConfig } from '../config.js';
import type { ServerNotification } from '@modelcontextprotocol/sdk/types.js';

export function registerReviewTools(server: McpServer, api: PlacetApiClient, config: McpConfig) {
  const channelParam = config.defaultChannel
    ? z
        .string()
        .optional()
        .describe(`Channel (agent) ID. Defaults to "${config.defaultChannel}" if omitted.`)
    : z.string().describe('Channel (agent) ID (required).');

  function resolveChannel(channelId?: string): string {
    const ch = channelId || config.defaultChannel;
    if (!ch) throw new Error('channelId is required (no PLACET_DEFAULT_CHANNEL set)');
    return ch;
  }

  // ── send_review_message ───────────────────────────────────────

  server.tool(
    'send_review_message',
    `Send a message that requires human review/interaction. Supports 5 review types:

• approval — Show buttons for the human to approve/reject. Payload: { options: [{ id, label, style? }], allowComment?: bool }. Styles: primary|danger|secondary|ghost.
• selection — Let the human pick from a list. Payload: { mode: "single"|"multi", items: [{ id, label, description? }] }.
• form — Render a form with typed fields. Payload: { fields: [{ name, type, label, required?, placeholder?, options?, defaultValue?, min?, max?, step?, unit? }], submitLabel? }. Field types: text|number|email|url|textarea|select|checkbox|date|time|datetime|range|password.
• text-input — Free text input (optionally markdown). Payload: { placeholder?, prefill?, markdown?: bool, minLength?, maxLength? }.
• freeform — Pass-through for plugin UIs. Payload: { plugin: "plugin-name", ...pluginData }.

By default returns immediately with the pending review. Set waitInline=true to wait for the response in the same call.
For long reviews, call wait_for_review separately after this tool returns.
Use iterationOf to create an iteration chain — link this review to a previous message that was reviewed (the target must have a completed or changes_requested review).`,
    {
      channelId: channelParam,
      text: z
        .string()
        .optional()
        .describe('Message text (supports markdown) shown above the review UI.'),
      reviewType: z
        .enum(['approval', 'selection', 'form', 'text-input', 'freeform'])
        .describe('The type of review to request.'),
      reviewPayload: z
        .record(z.string(), z.unknown())
        .describe(
          'Review-type-specific payload. See tool description for the schema of each review type.',
        ),
      expiresInSeconds: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('How long the review stays open in seconds (default: 24h, max: 36h).'),
      webhookUrl: z
        .string()
        .optional()
        .describe('Optional webhook URL to receive the review response.'),
      waitInline: z
        .boolean()
        .optional()
        .describe(
          'If true, wait for the review response before returning (max connection timeout). Default: false.',
        ),
      iterationOf: z
        .string()
        .optional()
        .describe(
          'ID of a previous message to iterate on. Creates an iteration chain. The target message must have a completed or changes_requested review.',
        ),
    },
    async (
      {
        channelId,
        text,
        reviewType,
        reviewPayload,
        expiresInSeconds,
        webhookUrl,
        waitInline,
        iterationOf,
      },
      { sendNotification, _meta },
    ) => {
      const channel = resolveChannel(channelId);

      // Send the message with review
      const message = await api.sendMessage({
        channelId: channel,
        text,
        review: {
          type: reviewType,
          payload: reviewPayload,
          ...(expiresInSeconds ? { expiresInSeconds } : {}),
        },
        ...(webhookUrl ? { webhookUrl } : {}),
        ...(iterationOf ? { iterationOf } : {}),
      });

      const msgId = (message as { id: string }).id;
      const review = (message as { review?: { expiresAt?: string } }).review;

      // Auto-acknowledge
      await api.acknowledgeMessage(msgId, channel).catch(() => {});

      // If not waiting inline, return immediately
      if (!waitInline) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  status: 'pending',
                  messageId: msgId,
                  expiresAt: review?.expiresAt,
                  hint: 'Call wait_for_review with this messageId to poll for the human response.',
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Wait inline
      return doWaitLoop(
        api,
        msgId,
        channel,
        config.connectionTimeoutMs,
        review?.expiresAt,
        sendNotification,
        _meta?.progressToken,
      );
    },
  );

  // ── wait_for_review ───────────────────────────────────────────

  server.tool(
    'wait_for_review',
    `Wait for a human to respond to a pending review. Holds the connection open (default 5 minutes) polling the backend every 30 seconds.
If the review is not completed within the connection timeout, returns status "timeout" — call this tool again to continue waiting.
Returns immediately if the review was completed, expired, or if changes were requested.
Works for reviews of any duration (minutes, hours, or days).`,
    {
      messageId: z.string().describe('The message ID containing the review.'),
      channelId: channelParam,
      connectionTimeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          `Max time to hold this connection open in ms (default: ${config.connectionTimeoutMs}).`,
        ),
    },
    async ({ messageId, channelId, connectionTimeoutMs }, { sendNotification, _meta }) => {
      const channel = resolveChannel(channelId);

      // Fetch current state to get expiresAt
      const current = await api.getReview(messageId, channel);
      const review = (current as { review?: { expiresAt?: string; status?: string } }).review;

      // Fast path: already resolved
      if (
        review?.status === 'completed' ||
        review?.status === 'expired' ||
        review?.status === 'changes_requested'
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ status: review.status, message: current }, null, 2),
            },
          ],
        };
      }

      const timeout = connectionTimeoutMs || config.connectionTimeoutMs;
      return doWaitLoop(
        api,
        messageId,
        channel,
        timeout,
        review?.expiresAt,
        sendNotification,
        _meta?.progressToken,
      );
    },
  );

  // ── get_pending_reviews ───────────────────────────────────────

  server.tool(
    'get_pending_reviews',
    'List all messages with pending reviews in a channel.',
    {
      channelId: channelParam,
    },
    async ({ channelId }) => {
      const reviews = await api.getPendingReviews(resolveChannel(channelId));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(reviews, null, 2) }],
      };
    },
  );
}

// ── Wait loop implementation ──────────────────────────────────────────────

async function doWaitLoop(
  api: PlacetApiClient,
  messageId: string,
  channel: string,
  connectionTimeoutMs: number,
  expiresAt: string | undefined,
  sendNotification: (notification: ServerNotification) => Promise<void>,
  progressToken?: string | number,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const deadline = Date.now() + connectionTimeoutMs;
  let elapsed = 0;
  let iteration = 0;

  while (Date.now() < deadline) {
    // Each backend poll is max 30s
    const remaining = deadline - Date.now();
    const pollTimeout = Math.min(30000, remaining);

    if (pollTimeout <= 0) break;

    const result: WaitResult = await api.waitForReview(messageId, channel, pollTimeout);

    if (
      result.status === 'completed' ||
      result.status === 'expired' ||
      result.status === 'changes_requested'
    ) {
      // Send final progress
      if (progressToken !== undefined) {
        await sendNotification({
          method: 'notifications/progress',
          params: {
            progressToken,
            progress: 1,
            total: 1,
            message: `Review ${result.status}.`,
          },
        });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ status: result.status, message: result.message }, null, 2),
          },
        ],
      };
    }

    // Still pending — send progress notification
    iteration++;
    elapsed = Math.round((Date.now() - (deadline - connectionTimeoutMs)) / 1000);

    if (progressToken !== undefined) {
      const progressMsg = expiresAt
        ? `Waiting for review… (elapsed: ${elapsed}s, expires: ${expiresAt})`
        : `Waiting for review… (elapsed: ${elapsed}s)`;

      await sendNotification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: iteration,
          total: Math.ceil(connectionTimeoutMs / 30000),
          message: progressMsg,
        },
      });
    }
  }

  // Connection timeout reached, review still pending
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            status: 'timeout',
            messageId,
            hint: 'Review is still pending. Call wait_for_review again with the same messageId to continue waiting.',
          },
          null,
          2,
        ),
      },
    ],
  };
}
