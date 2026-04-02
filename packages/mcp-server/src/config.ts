// ---------------------------------------------------------------------------
// Placet MCP Server – Configuration
// ---------------------------------------------------------------------------

export interface McpConfig {
  /** Placet backend API URL (required). */
  apiUrl: string;
  /** Placet API key, starts with hp_. Required for stdio, optional for HTTP (client provides it). */
  apiKey?: string;
  /** Default channel (agent) ID. When set, channelId becomes optional in tools. */
  defaultChannel?: string;
  /** HTTP transport port (default 3002). */
  port: number;
  /** HTTP transport path (default /mcp). */
  path: string;
  /** Max time a single wait_for_review connection stays open in ms (default 300 000 = 5 min). */
  connectionTimeoutMs: number;
}

export function loadConfig(): McpConfig {
  const apiUrl = process.env.PLACET_API_URL;

  if (!apiUrl) {
    throw new Error('PLACET_API_URL environment variable is required');
  }

  const apiKey = process.env.PLACET_API_KEY || undefined;
  if (apiKey && !apiKey.startsWith('hp_')) {
    throw new Error('PLACET_API_KEY must start with "hp_"');
  }

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''), // strip trailing slash
    apiKey,
    defaultChannel: process.env.PLACET_DEFAULT_CHANNEL || undefined,
    port: parseInt(process.env.MCP_PORT || '3002', 10),
    path: process.env.MCP_PATH || '/mcp',
    connectionTimeoutMs: parseInt(process.env.MCP_CONNECTION_TIMEOUT_MS || '300000', 10),
  };
}
