#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Placet MCP Server – Entry Point
// ---------------------------------------------------------------------------
// Supports two transport modes:
//   1. StreamableHTTP (default) — for remote/SaaS/docker deployment
//   2. stdio — for local use via `npx @placet/mcp --stdio`
// ---------------------------------------------------------------------------

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { randomUUID } from 'node:crypto';

import { loadConfig } from './config.js';
import { PlacetApiClient } from './api/client.js';
import { registerMessageTools } from './tools/messages.js';
import { registerReviewTools } from './tools/reviews.js';
import { registerAgentTools } from './tools/agents.js';
import { registerPluginTools } from './tools/plugins.js';

async function main() {
  const config = loadConfig();

  // ── Choose Transport ────────────────────────────────────────

  const useStdio = process.argv.includes('--stdio') || process.env.MCP_TRANSPORT === 'stdio';

  if (useStdio) {
    // stdio mode — single client, API key from env var
    if (!config.apiKey) {
      throw new Error('PLACET_API_KEY environment variable is required for stdio mode');
    }

    const api = new PlacetApiClient({ apiUrl: config.apiUrl, apiKey: config.apiKey });

    const server = new McpServer({
      name: 'placet-mcp',
      version: '0.1.0',
    });

    registerMessageTools(server, api, config);
    registerReviewTools(server, api, config);
    registerAgentTools(server, api);

    const pluginRegistry = registerPluginTools(server, api, config);
    const pluginTools = await pluginRegistry.registerDynamic();
    if (pluginTools.length > 0) {
      console.error(
        `[placet-mcp] Registered ${pluginTools.length} plugin tool(s): ${pluginTools.join(', ')}`,
      );
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[placet-mcp] Running in stdio mode');
  } else {
    // HTTP mode — multi-client, API key from client x-api-key header
    const app = express();
    // Do NOT use express.json() globally — StreamableHTTPServerTransport
    // needs to read the raw request body stream itself.

    // Session management for multi-client isolation
    const sessions = new Map<
      string,
      { transport: StreamableHTTPServerTransport; server: McpServer }
    >();

    app.all(config.path, async (req, res) => {
      // Handle session-based routing
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (req.method === 'GET' || req.method === 'DELETE') {
        // GET = SSE stream, DELETE = close session
        if (!sessionId || !sessions.has(sessionId)) {
          res.status(400).json({ error: 'Invalid or missing session ID' });
          return;
        }
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        if (req.method === 'DELETE') {
          sessions.delete(sessionId);
        }
        return;
      }

      // POST — could be new session init or existing session message
      if (sessionId && sessions.has(sessionId)) {
        // Existing session
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        return;
      }

      // New session — extract API key from client's x-api-key header
      const apiKey = (req.headers['x-api-key'] as string) ?? '';

      if (!apiKey.startsWith('hp_')) {
        res.status(401).json({
          error: 'x-api-key header required: hp_<your-api-key>',
        });
        return;
      }

      // Create per-session API client with the client's key
      const sessionApi = new PlacetApiClient({ apiUrl: config.apiUrl, apiKey });

      const sessionServer = new McpServer({
        name: 'placet-mcp',
        version: '0.1.0',
      });

      // Register tools on the new session server
      registerMessageTools(sessionServer, sessionApi, config);
      registerReviewTools(sessionServer, sessionApi, config);
      registerAgentTools(sessionServer, sessionApi);
      const sessionPlugins = registerPluginTools(sessionServer, sessionApi, config);
      // Register dynamic plugins (non-blocking)
      void sessionPlugins.registerDynamic();

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, server: sessionServer });
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
      };

      await sessionServer.connect(transport);
      await transport.handleRequest(req, res);
    });

    // Health check
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', sessions: sessions.size });
    });

    const httpServer = app.listen(config.port, () => {
      console.error(`[placet-mcp] Listening on http://0.0.0.0:${config.port}${config.path}`);
      console.error(`[placet-mcp] Backend: ${config.apiUrl}`);
      if (config.defaultChannel) {
        console.error(`[placet-mcp] Default channel: ${config.defaultChannel}`);
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.error('[placet-mcp] Shutting down...');
      for (const [id, session] of sessions) {
        void session.transport.close();
        sessions.delete(id);
      }
      httpServer.close();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

main().catch((err) => {
  console.error('[placet-mcp] Fatal error:', err);
  process.exit(1);
});
