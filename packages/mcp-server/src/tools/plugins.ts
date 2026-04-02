// ---------------------------------------------------------------------------
// Placet MCP Server – Plugin Tools (Dynamic Registration)
// ---------------------------------------------------------------------------
// At startup, fetches all installed plugin manifests from the backend and
// registers a dynamic MCP tool for each plugin that has an inputSchema.
// Also provides a static list_plugins tool.
// ---------------------------------------------------------------------------

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlacetApiClient } from '../api/client.js';
import type { McpConfig } from '../config.js';

interface PluginManifest {
  name: string;
  displayName: string;
  description?: string;
  version: string;
  inputSchema?: Record<string, unknown>;
}

export function registerPluginTools(server: McpServer, api: PlacetApiClient, config: McpConfig) {
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

  // ── list_plugins (static) ─────────────────────────────────────

  server.tool(
    'list_plugins',
    'List all installed Placet plugins and their capabilities.',
    {},
    async () => {
      const plugins = await api.listPlugins();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(plugins, null, 2) }],
      };
    },
  );

  // ── Dynamic plugin tools ──────────────────────────────────────

  // Returns the list of registered plugin tool names (for logging)
  return {
    async registerDynamic(): Promise<string[]> {
      let manifests: PluginManifest[];
      try {
        manifests = (await api.listPlugins()) as unknown as PluginManifest[];
      } catch (err) {
        console.warn(
          '[placet-mcp] Could not fetch plugins from backend — no dynamic plugin tools registered:',
          err instanceof Error ? err.message : err,
        );
        return [];
      }

      const registered: string[] = [];

      for (const manifest of manifests) {
        if (!manifest.inputSchema) continue;

        const toolName = `send_${manifest.name.replace(/-/g, '_')}_message`;
        const description = [
          `Send a "${manifest.displayName}" plugin message to a Placet channel for human interaction.`,
          manifest.description ? `Plugin: ${manifest.description}` : '',
          `Input fields (pluginData): ${JSON.stringify(manifest.inputSchema)}`,
          'Returns the pending review. Use wait_for_review to poll for the human response.',
        ]
          .filter(Boolean)
          .join('\n');

        server.tool(
          toolName,
          description,
          {
            channelId: channelParam,
            text: z.string().optional().describe('Message text shown above the plugin UI.'),
            pluginData: z
              .record(z.string(), z.unknown())
              .describe(`Plugin input data. Schema: ${JSON.stringify(manifest.inputSchema)}`),
            expiresInSeconds: z
              .number()
              .int()
              .positive()
              .optional()
              .describe('How long the review stays open in seconds (default: 24h).'),
          },
          async ({ channelId, text, pluginData, expiresInSeconds }) => {
            const channel = resolveChannel(channelId);

            const message = await api.sendMessage({
              channelId: channel,
              text,
              review: {
                type: 'freeform',
                payload: {
                  plugin: manifest.name,
                  ...pluginData,
                },
                ...(expiresInSeconds ? { expiresInSeconds } : {}),
              },
            });

            const msgId = (message as { id: string }).id;
            const review = (message as { review?: { expiresAt?: string } }).review;

            // Auto-acknowledge
            await api.acknowledgeMessage(msgId, channel).catch(() => {});

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
          },
        );

        registered.push(toolName);
      }

      return registered;
    },
  };
}
