import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Generic ────────────────────────────────────────────────────────────────

export class DeletedResponse {
  @ApiProperty({ example: true })
  deleted: boolean;
}

export class MessageResponse {
  @ApiProperty({ example: 'Logged out' })
  message: string;
}

// ── Auth ───────────────────────────────────────────────────────────────────

class LoginUser {
  @ApiProperty({ example: 'clxyz123' })
  id: string;

  @ApiProperty({ example: 'admin@placet.local' })
  email: string;

  @ApiProperty({ example: 'Admin' })
  displayName: string;

  @ApiProperty({ example: 'owner', enum: ['owner', 'member'] })
  role: string;
}

export class LoginResponse {
  @ApiProperty({ type: LoginUser })
  user: LoginUser;
}

// ── User ───────────────────────────────────────────────────────────────────

export class UserResponse {
  @ApiProperty({ example: 'clxyz123' })
  id: string;

  @ApiProperty({ example: 'admin@placet.local' })
  email: string;

  @ApiProperty({ example: 'Admin' })
  displayName: string;

  @ApiProperty({ example: 'owner', enum: ['owner', 'member'] })
  role: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt: string;
}

// ── Agent ──────────────────────────────────────────────────────────────────

export class AgentResponse {
  @ApiProperty({ example: 'clxyz456' })
  id: string;

  @ApiProperty({ example: 'My Agent' })
  name: string;

  @ApiPropertyOptional({ example: 'A helpful assistant' })
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/webhook' })
  webhookUrl?: string;

  @ApiPropertyOptional({ example: '2025-01-01T12:00:00.000Z' })
  lastActiveAt?: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt: string;
}

// ── API Key ───────────────────────────────────────────────────────────────

export class ApiKeyResponse {
  @ApiProperty({ example: 'clxyz789' })
  id: string;

  @ApiProperty({ example: 'clxyz123' })
  userId: string;

  @ApiProperty({ example: 'Production' })
  label: string;

  @ApiProperty({ example: 'hp_a3f8abc' })
  keyPrefix: string;

  @ApiPropertyOptional({ example: '2025-06-01T12:00:00.000Z' })
  lastUsedAt?: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt: string;
}

export class CreateApiKeyResponse extends ApiKeyResponse {
  @ApiProperty({
    example: 'hp_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
    description: 'Full API key — shown only once at creation',
  })
  key: string;
}

// ── Attachment ─────────────────────────────────────────────────────────────

export class AttachmentResponse {
  @ApiProperty({ example: 'clxyz789' })
  id: string;

  @ApiProperty({ example: 'clxyz123' })
  messageId: string;

  @ApiProperty({ example: 'file' })
  pluginType: string;

  @ApiProperty({ example: 'report.pdf' })
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 1024 })
  size: number;

  @ApiProperty({ example: 'uploads/clxyz123/report.pdf' })
  storageKey: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt: string;
}

// ── Message ────────────────────────────────────────────────────────────────

export class MessageItemResponse {
  @ApiProperty({ example: 'clxyz111' })
  id: string;

  @ApiProperty({ example: 'clxyz456' })
  channelId: string;

  @ApiProperty({ example: 'agent', enum: ['agent', 'user'] })
  senderType: string;

  @ApiProperty({ example: 'clxyz456' })
  senderId: string;

  @ApiPropertyOptional({ example: 'Hello from agent' })
  text?: string;

  @ApiPropertyOptional({
    example: 'info',
    enum: ['info', 'success', 'warning', 'error'],
  })
  status?: string;

  @ApiPropertyOptional({
    example: { type: 'approval', status: 'pending' },
    description: 'Review object (null if no review)',
  })
  review?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: { source: 'automation' },
    description: 'Arbitrary metadata',
  })
  metadata?: Record<string, unknown>;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: [AttachmentResponse] })
  attachments: AttachmentResponse[];
}

export class PaginatedMessagesResponse {
  @ApiProperty({ type: [MessageItemResponse] })
  data: MessageItemResponse[];

  @ApiPropertyOptional({
    example: 'clxyz999',
    description: 'Cursor for next page, null if no more',
    nullable: true,
  })
  nextCursor?: string | null;
}

// ── Review Wait ────────────────────────────────────────────────────────────

export class ReviewWaitResponse {
  @ApiProperty({ example: 'completed', enum: ['completed', 'timeout'] })
  status: string;

  @ApiPropertyOptional({ type: MessageItemResponse })
  message?: MessageItemResponse;
}

// ── Preferences ────────────────────────────────────────────────────────────

export class PreferencesResponse {
  @ApiProperty({ example: 'clxyz123' })
  userId: string;

  @ApiProperty({ example: 'dark', enum: ['light', 'dark', 'system'] })
  theme: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  updatedAt: string;
}

// ── Logs ───────────────────────────────────────────────────────────────────

export class ApiLogResponse {
  @ApiProperty({ example: 'clxyz999' })
  id: string;

  @ApiPropertyOptional({ example: 'clxyz456' })
  apiKeyId?: string;

  @ApiProperty({ example: 'clxyz123' })
  userId: string;

  @ApiProperty({ example: 'POST', enum: ['GET', 'POST', 'PATCH', 'DELETE'] })
  method: string;

  @ApiProperty({ example: '/api/v1/messages' })
  path: string;

  @ApiPropertyOptional({ example: { text: 'hello' } })
  requestBody?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { id: 'clxyz111' } })
  responseBody?: Record<string, unknown>;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 42 })
  durationMs: number;

  @ApiProperty({ example: 'inbound', enum: ['inbound', 'outbound'] })
  direction: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt: string;
}

export class PaginatedLogsResponse {
  @ApiProperty({ type: [ApiLogResponse] })
  data: ApiLogResponse[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string | null;
}

// ── Health ─────────────────────────────────────────────────────────────────

export class HealthResponse {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  timestamp: string;
}

// ── Errors ─────────────────────────────────────────────────────────────────

export class ZodValidationError {
  @ApiProperty({ example: 'invalid_type' })
  code: string;

  @ApiProperty({ example: 'Expected string, received number' })
  message: string;

  @ApiProperty({ example: ['email'], type: [String] })
  path: string[];
}

export class ErrorResponse {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiPropertyOptional({
    description: 'Zod validation errors (only on 400)',
    type: [ZodValidationError],
  })
  errors?: ZodValidationError[];
}
