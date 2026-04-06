// ---------------------------------------------------------------------------
// Placet MCP Server – Message Tools
// ---------------------------------------------------------------------------

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlacetApiClient } from '../api/client.js';
import type { McpConfig } from '../config.js';

export function registerMessageTools(server: McpServer, api: PlacetApiClient, config: McpConfig) {
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

  // ── send_message ──────────────────────────────────────────────

  server.tool(
    'send_message',
    `Send an informational message from the agent to a Placet channel. Automatically acknowledges receipt.
Use this for status updates, logs, reports, and any content that does not require human interaction.
The text field supports full markdown (headings, bold, italic, lists, code blocks, links, tables, etc.).
Use the status field to show a colored indicator: info (blue), success (green), warning (yellow), error (red).
For messages that require human input (approvals, forms, selections), use send_review_message instead.
Use iterationOf to create an iteration chain — link this message to a previous one that was reviewed (the target must have a completed or changes_requested review).`,
    {
      channelId: channelParam,
      text: z
        .string()
        .optional()
        .describe(
          'Message text. Supports full markdown: headings, bold, italic, lists, code blocks, tables, links.',
        ),
      status: z
        .enum(['info', 'success', 'warning', 'error'])
        .optional()
        .describe(
          'Visual status indicator: info (blue), success (green), warning (yellow), error (red).',
        ),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Arbitrary key-value metadata attached to the message (not displayed to the user, available via API).',
        ),
      iterationOf: z
        .string()
        .optional()
        .describe(
          'ID of a previous message to iterate on. Creates an iteration chain. The target message must have a completed or changes_requested review.',
        ),
    },
    async ({ channelId, text, status, metadata, iterationOf }) => {
      const channel = resolveChannel(channelId);
      const message = await api.sendMessage({
        channelId: channel,
        text,
        status,
        metadata,
        ...(iterationOf ? { iterationOf } : {}),
      });

      // Auto-acknowledge receipt
      const msgId = (message as { id: string }).id;
      await api.acknowledgeMessage(msgId, channel).catch(() => {
        // non-critical — swallow errors
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(message, null, 2) }],
      };
    },
  );

  // ── get_messages ──────────────────────────────────────────────

  server.tool(
    'get_messages',
    'List messages in a Placet channel with optional search and pagination.',
    {
      channelId: channelParam,
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max results (default 50, max 100).'),
      cursor: z.string().optional().describe('Pagination cursor from a previous response.'),
      search: z.string().optional().describe('Full-text search in message text.'),
    },
    async ({ channelId, limit, cursor, search }) => {
      const result = await api.getMessages(resolveChannel(channelId), {
        limit,
        cursor,
        search,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── get_message ───────────────────────────────────────────────

  server.tool(
    'get_message',
    'Get a single message by ID, including its review status and attachments.',
    {
      messageId: z.string().describe('The message ID.'),
      channelId: channelParam,
    },
    async ({ messageId, channelId }) => {
      const message = await api.getMessage(messageId, resolveChannel(channelId));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(message, null, 2) }],
      };
    },
  );

  // ── delete_message ────────────────────────────────────────────

  server.tool(
    'delete_message',
    'Delete (retract) a message from a channel.',
    {
      messageId: z.string().describe('The message ID to delete.'),
      channelId: channelParam,
    },
    async ({ messageId, channelId }) => {
      const result = await api.deleteMessage(messageId, resolveChannel(channelId));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    },
  );

  // ── get_iteration_chain ─────────────────────────────────────

  server.tool(
    'get_iteration_chain',
    `Get the full iteration chain for a message. Returns all messages in the same iteration group, ordered by iteration number.
Use this to see previous versions, review feedback, and the progression of an iterative review workflow.`,
    {
      messageId: z.string().describe('ID of any message in the iteration chain.'),
      channelId: channelParam,
    },
    async ({ messageId, channelId }) => {
      const chain = await api.getIterationChain(messageId, resolveChannel(channelId));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(chain, null, 2) }],
      };
    },
  );
}
