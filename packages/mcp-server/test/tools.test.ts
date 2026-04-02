// ---------------------------------------------------------------------------
// Placet MCP Server – Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlacetApiClient, ApiError } from '../src/api/client.js';
import type { McpConfig } from '../src/config.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<McpConfig> = {}): McpConfig {
  return {
    apiUrl: 'http://localhost:3001',
    port: 3002,
    path: '/mcp',
    connectionTimeoutMs: 5000,
    ...overrides,
  };
}

function makeClient(apiKey = 'hp_test-key', apiUrl = 'http://localhost:3001') {
  return new PlacetApiClient({ apiUrl, apiKey });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, body = '') {
  return new Response(body, { status });
}

// ── PlacetApiClient ─────────────────────────────────────────────────────────

describe('PlacetApiClient', () => {
  let client: PlacetApiClient;

  beforeEach(() => {
    client = makeClient();
    vi.restoreAllMocks();
  });

  describe('sendMessage', () => {
    it('sends POST with correct body and auth header', async () => {
      const mockFetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ id: 'msg-1', text: 'hello' }));

      const result = await client.sendMessage({
        channelId: 'ch-1',
        text: 'hello',
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://localhost:3001/api/v1/messages');
      expect(opts?.method).toBe('POST');
      expect(opts?.headers).toMatchObject({
        'x-api-key': 'hp_test-key',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(opts?.body as string)).toEqual({
        channelId: 'ch-1',
        text: 'hello',
      });
      expect(result).toEqual({ id: 'msg-1', text: 'hello' });
    });
  });

  describe('getMessage', () => {
    it('fetches a single message by ID', async () => {
      const mockFetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ id: 'msg-1' }));

      await client.getMessage('msg-1', 'ch-1');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://localhost:3001/api/v1/messages/msg-1?channel=ch-1');
    });
  });

  describe('getMessages', () => {
    it('passes pagination and search params', async () => {
      const mockFetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ data: [], nextCursor: null }));

      await client.getMessages('ch-1', {
        limit: 10,
        cursor: 'abc',
        search: 'test',
      });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get('channel')).toBe('ch-1');
      expect(parsed.searchParams.get('limit')).toBe('10');
      expect(parsed.searchParams.get('cursor')).toBe('abc');
      expect(parsed.searchParams.get('search')).toBe('test');
    });
  });

  describe('deleteMessage', () => {
    it('sends DELETE request', async () => {
      const mockFetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ deleted: true }));

      const result = await client.deleteMessage('msg-1', 'ch-1');

      expect(mockFetch.mock.calls[0]![1]?.method).toBe('DELETE');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('acknowledgeMessage', () => {
    it('sends POST to ack endpoint', async () => {
      const mockFetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ acknowledged: true }));

      await client.acknowledgeMessage('msg-1', 'ch-1');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://localhost:3001/api/v1/messages/msg-1/ack?channel=ch-1');
    });
  });

  describe('waitForReview', () => {
    it('passes timeout as query param', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ status: 'completed', message: {} }),
      );

      await client.waitForReview('msg-1', 'ch-1', 15000);

      const [url] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toContain('timeout=15000');
    });
  });

  describe('pingStatus', () => {
    it('sends status ping', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));

      await client.pingStatus({
        agentId: 'agent-1',
        status: 'active',
        message: 'running',
      });

      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://localhost:3001/api/v1/status/ping');
      expect(JSON.parse(opts?.body as string)).toEqual({
        agentId: 'agent-1',
        status: 'active',
        message: 'running',
      });
    });
  });

  describe('listPlugins', () => {
    it('fetches plugin list', async () => {
      const mockFetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse([{ name: 'form-submit' }]));

      const result = await client.listPlugins();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://localhost:3001/api/v1/plugins');
      expect(result).toEqual([{ name: 'form-submit' }]);
    });
  });

  describe('error handling', () => {
    it('throws ApiError on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(403, 'Forbidden'));

      await expect(client.sendMessage({ channelId: 'ch-1', text: 'hi' })).rejects.toThrow(ApiError);

      try {
        await client.sendMessage({ channelId: 'ch-1', text: 'hi' });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(403);
      }
    });

    it('encodes special characters in IDs', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'a/b' }));

      await client.getMessage('a/b', 'ch-1');

      const [url] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toContain('a%2Fb');
    });
  });
});

// ── Config ──────────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when PLACET_API_URL is missing', async () => {
    delete process.env.PLACET_API_URL;
    delete process.env.PLACET_API_KEY;

    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow('PLACET_API_URL');
  });

  it('throws when PLACET_API_KEY has invalid prefix', async () => {
    process.env.PLACET_API_URL = 'http://localhost:3001';
    process.env.PLACET_API_KEY = 'bad-key';

    const config = await import('../src/config.js');
    expect(() => config.loadConfig()).toThrow('hp_');
  });

  it('allows missing PLACET_API_KEY (optional for HTTP mode)', async () => {
    process.env.PLACET_API_URL = 'http://localhost:3001';
    delete process.env.PLACET_API_KEY;

    const config = await import('../src/config.js');
    const result = config.loadConfig();
    expect(result.apiKey).toBeUndefined();
  });

  it('parses valid config', async () => {
    process.env.PLACET_API_URL = 'http://localhost:3001/';
    process.env.PLACET_API_KEY = 'hp_valid';
    process.env.PLACET_DEFAULT_CHANNEL = 'ch-1';
    process.env.MCP_PORT = '4000';
    process.env.MCP_PATH = '/custom';
    process.env.MCP_CONNECTION_TIMEOUT_MS = '60000';

    const config = await import('../src/config.js');
    const result = config.loadConfig();

    expect(result.apiUrl).toBe('http://localhost:3001'); // trailing slash stripped
    expect(result.apiKey).toBe('hp_valid');
    expect(result.defaultChannel).toBe('ch-1');
    expect(result.port).toBe(4000);
    expect(result.path).toBe('/custom');
    expect(result.connectionTimeoutMs).toBe(60000);
  });
});

// ── ApiError ────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('includes status code and body in message', () => {
    const err = new ApiError(404, 'Not Found');
    expect(err.message).toContain('404');
    expect(err.message).toContain('Not Found');
    expect(err.statusCode).toBe(404);
    expect(err.body).toBe('Not Found');
    expect(err.name).toBe('ApiError');
  });
});
