// ---------------------------------------------------------------------------
// Placet MCP Server – API Client
// ---------------------------------------------------------------------------
// Typed fetch wrapper for the Placet Agent API (v1).
// Uses native fetch (Node ≥ 22) — no external HTTP library needed.
// ---------------------------------------------------------------------------

// ── Request / Response types ────────────────────────────────────────────────

export interface SendMessageDto {
  channelId: string;
  text?: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  review?: {
    type: string;
    payload?: Record<string, unknown>;
    expiresInSeconds?: number;
    expiresAt?: string;
    callback?: { url: string; method?: string; headers?: Record<string, string> };
  };
  metadata?: Record<string, unknown>;
  webhookUrl?: string;
  attachmentIds?: string[];
}

export interface PingStatusDto {
  agentId: string;
  status: 'active' | 'busy' | 'error' | 'offline';
  message?: string;
}

export interface CreateAgentDto {
  name: string;
  description?: string;
  webhookUrl?: string;
}

export interface WaitResult {
  status: 'completed' | 'expired' | 'timeout';
  message?: Record<string, unknown>;
}

export interface PaginatedMessages {
  data: Record<string, unknown>[];
  nextCursor: string | null;
}

// ── Client ──────────────────────────────────────────────────────────────────

export class PlacetApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: { apiUrl: string; apiKey: string }) {
    this.baseUrl = config.apiUrl;
    this.headers = {
      'x-api-key': config.apiKey,
      'Content-Type': 'application/json',
    };
  }

  // ── Messages ────────────────────────────────────────────────

  async sendMessage(dto: SendMessageDto): Promise<Record<string, unknown>> {
    return this.post('/api/v1/messages', dto);
  }

  async getMessage(id: string, channel: string): Promise<Record<string, unknown>> {
    return this.get(`/api/v1/messages/${enc(id)}?channel=${enc(channel)}`);
  }

  async getMessages(
    channel: string,
    opts?: { limit?: number; cursor?: string; search?: string; has_attachments?: boolean },
  ): Promise<PaginatedMessages> {
    const params = new URLSearchParams({ channel });
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.cursor) params.set('cursor', opts.cursor);
    if (opts?.search) params.set('search', opts.search);
    if (opts?.has_attachments) params.set('has_attachments', 'true');
    return this.get(`/api/v1/messages?${params}`);
  }

  async deleteMessage(id: string, channel: string): Promise<{ deleted: boolean }> {
    return this.del(`/api/v1/messages/${enc(id)}?channel=${enc(channel)}`);
  }

  async acknowledgeMessage(id: string, channel: string): Promise<{ acknowledged: boolean }> {
    return this.post(`/api/v1/messages/${enc(id)}/ack?channel=${enc(channel)}`, {});
  }

  // ── Reviews ─────────────────────────────────────────────────

  async getPendingReviews(channel: string): Promise<Record<string, unknown>[]> {
    return this.get(`/api/v1/reviews/pending?channel=${enc(channel)}`);
  }

  async getReview(id: string, channel: string): Promise<Record<string, unknown>> {
    return this.get(`/api/v1/reviews/${enc(id)}?channel=${enc(channel)}`);
  }

  async waitForReview(id: string, channel: string, timeout = 30000): Promise<WaitResult> {
    return this.get(`/api/v1/reviews/${enc(id)}/wait?channel=${enc(channel)}&timeout=${timeout}`);
  }

  // ── Agents ──────────────────────────────────────────────────

  async listAgents(): Promise<Record<string, unknown>[]> {
    return this.get('/api/v1/agents');
  }

  async createAgent(dto: CreateAgentDto): Promise<Record<string, unknown>> {
    return this.post('/api/v1/agents', dto);
  }

  // ── Agent status ────────────────────────────────────────────

  async pingStatus(dto: PingStatusDto): Promise<Record<string, unknown>> {
    return this.post('/api/v1/status/ping', dto);
  }

  // ── Plugins ─────────────────────────────────────────────────

  async listPlugins(): Promise<Record<string, unknown>[]> {
    return this.get('/api/v1/plugins');
  }

  async getPlugin(name: string): Promise<Record<string, unknown>> {
    return this.get(`/api/v1/plugins/${enc(name)}`);
  }

  // ── HTTP helpers ────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers,
    });
    return this.handleResponse<T>(res);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(res);
  }

  private async del<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: { 'x-api-key': this.headers['x-api-key'] },
    });
    return this.handleResponse<T>(res);
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(res.status, text || res.statusText);
    }
    return (await res.json()) as T;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`Placet API error ${statusCode}: ${body}`);
    this.name = 'ApiError';
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
