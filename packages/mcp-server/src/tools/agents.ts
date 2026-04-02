// ---------------------------------------------------------------------------
// Placet MCP Server – Agent Status Tools
// ---------------------------------------------------------------------------

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlacetApiClient } from '../api/client.js';

export function registerAgentTools(server: McpServer, api: PlacetApiClient) {
  server.tool(
    'list_channels',
    'List all channels (agents) accessible by this API key.',
    {},
    async () => {
      const result = await api.listAgents();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'create_channel',
    'Create a new channel (agent) in Placet.',
    {
      name: z.string().min(1).describe('Display name for the channel/agent.'),
      description: z.string().optional().describe('Optional description.'),
      webhookUrl: z
        .string()
        .url()
        .optional()
        .describe('Optional webhook URL for message delivery.'),
    },
    async ({ name, description, webhookUrl }) => {
      const result = await api.createAgent({ name, description, webhookUrl });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'ping_status',
    'Report agent status (heartbeat) to Placet. Updates the status shown in the UI.',
    {
      agentId: z.string().describe('The agent ID to update status for.'),
      status: z.enum(['active', 'busy', 'error', 'offline']).describe('Agent status.'),
      message: z.string().max(500).optional().describe('Optional status message (max 500 chars).'),
    },
    async ({ agentId, status, message }) => {
      const result = await api.pingStatus({ agentId, status, message });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
