// ---------------------------------------------------------------------------
// HumanProxy – Shared Zod Schemas & Inferred Types
// ---------------------------------------------------------------------------
// Single source of truth for all data shapes. Used by:
//   Backend:  createZodDto(schema) → NestJS DTO + Swagger docs + validation
//   Frontend: z.infer<typeof schema> → TypeScript types + runtime validation
// ---------------------------------------------------------------------------

import { z } from 'zod/v4';

// ── Enums ───────────────────────────────────────────────────────────────────

export const UserRoleSchema = z.enum(['owner', 'member']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const MessageSenderTypeSchema = z.enum(['agent', 'user']);
export type MessageSenderType = z.infer<typeof MessageSenderTypeSchema>;

export const MessageStatusSchema = z.enum(['info', 'success', 'warning', 'error']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const ReviewStatusSchema = z.enum(['pending', 'completed', 'expired']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ThemeSchema = z.enum(['light', 'dark', 'system']);
export type Theme = z.infer<typeof ThemeSchema>;

export const ApiLogDirectionSchema = z.enum(['inbound', 'outbound']);
export type ApiLogDirection = z.infer<typeof ApiLogDirectionSchema>;

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PATCH', 'DELETE']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const AgentStatusSchema = z.enum(['active', 'busy', 'error', 'offline']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// ── Core Entity Schemas ─────────────────────────────────────────────────────

export const ReviewCallbackSchema = z.object({
  url: z.string().url(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type ReviewCallback = z.infer<typeof ReviewCallbackSchema>;

/** Max review duration agents may request (36 hours). */
export const MAX_REVIEW_DURATION_SECONDS = 36 * 60 * 60;
/** Default review duration when none is specified (24 hours). */
export const DEFAULT_REVIEW_DURATION_SECONDS = 24 * 60 * 60;

export const ReviewSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
  status: ReviewStatusSchema,
  response: z.record(z.string(), z.unknown()).nullish(),
  callback: ReviewCallbackSchema.nullish(),
  expiresAt: z.string().nullish(),
  /** Convenience alternative to expiresAt: duration in seconds from now. */
  expiresInSeconds: z.number().int().positive().optional(),
  completedAt: z.string().nullish(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: UserRoleSchema,
  mustChangePassword: z.boolean().optional(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const WebhookAuthSchema = z.object({
  username: z.string(),
  password: z.string(),
});
export type WebhookAuth = z.infer<typeof WebhookAuthSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  avatarUrl: z.string().url().nullish(),
  webhookUrl: z.string().url().nullish(),
  webhookHeaders: z.record(z.string(), z.string()).nullish(),
  webhookAuth: WebhookAuthSchema.nullish(),
  status: AgentStatusSchema,
  statusMessage: z.string().nullish(),
  statusSince: z.string().nullish(),
  lastActiveAt: z.string().nullish(),
  createdAt: z.string(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const ApiKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  label: z.string(),
  keyPrefix: z.string(),
  lastUsedAt: z.string().nullish(),
  createdAt: z.string(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const AttachmentSchema = z.object({
  id: z.string(),
  messageId: z.string().nullish(),
  channelId: z.string(),
  pluginType: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  storageKey: z.string(),
  pluginData: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  senderType: MessageSenderTypeSchema,
  senderId: z.string(),
  text: z.string().nullish(),
  status: MessageStatusSchema.nullish(),
  review: ReviewSchema.nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.string(),
  attachments: z.array(AttachmentSchema).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ApiLogSchema = z.object({
  id: z.string(),
  apiKeyId: z.string().nullish(),
  userId: z.string(),
  method: HttpMethodSchema,
  path: z.string(),
  requestBody: z.record(z.string(), z.unknown()).nullish(),
  responseBody: z.record(z.string(), z.unknown()).nullish(),
  statusCode: z.number().int(),
  durationMs: z.number().int(),
  direction: ApiLogDirectionSchema,
  createdAt: z.string(),
});
export type ApiLog = z.infer<typeof ApiLogSchema>;

export const UserPreferencesSchema = z.object({
  userId: z.string(),
  theme: ThemeSchema,
  updatedAt: z.string(),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const InstalledPluginSchema = z.object({
  id: z.string(),
  npmName: z.string(),
  version: z.string(),
  enabled: z.boolean(),
  installedAt: z.string(),
});
export type InstalledPlugin = z.infer<typeof InstalledPluginSchema>;

// ── Request Schemas ─────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(8),
  role: UserRoleSchema.optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: UserRoleSchema.optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserSchema>;

export const CreateAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  webhookUrl: z.string().url().optional(),
});
export type CreateAgentRequest = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  webhookUrl: z.string().url().nullable().optional(),
  webhookHeaders: z.record(z.string(), z.string()).nullable().optional(),
  webhookAuth: WebhookAuthSchema.nullable().optional(),
});
export type UpdateAgentRequest = z.infer<typeof UpdateAgentSchema>;

export const CreateApiKeySchema = z.object({
  label: z.string().min(1).max(64).optional(),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeySchema>;

export const CreateAgentMessageSchema = z.object({
  channelId: z.string().min(1),
  text: z.string().optional(),
  status: MessageStatusSchema.optional(),
  review: ReviewSchema.omit({ status: true, response: true, completedAt: true }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  webhookUrl: z.string().url().optional(),
  attachmentIds: z.array(z.string()).optional(),
});
export type CreateAgentMessageRequest = z.infer<typeof CreateAgentMessageSchema>;

export const CreateUserMessageSchema = z.object({
  channelId: z.string().min(1),
  text: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});
export type CreateUserMessageRequest = z.infer<typeof CreateUserMessageSchema>;

export const RespondReviewSchema = z.object({
  response: z.record(z.string(), z.unknown()),
  annotationFileId: z.string().optional(),
});
export type RespondReviewRequest = z.infer<typeof RespondReviewSchema>;

export const PresignUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
});
export type PresignUploadRequest = z.infer<typeof PresignUploadSchema>;

export const UpdatePreferencesSchema = z.object({
  theme: ThemeSchema.optional(),
});
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesSchema>;

// ── Response Types ──────────────────────────────────────────────────────────

export interface LoginResponse {
  user: Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'mustChangePassword'>;
}

export interface CreateApiKeyResponse extends ApiKey {
  key: string; // full key, shown only once
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string | null;
}

// ── Agent Status ────────────────────────────────────────────────────────────

export const AgentStatusHistorySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  status: AgentStatusSchema,
  message: z.string().nullish(),
  createdAt: z.string(),
});
export type AgentStatusHistoryEntry = z.infer<typeof AgentStatusHistorySchema>;

export const PingStatusSchema = z.object({
  agentId: z.string().min(1),
  status: AgentStatusSchema,
  message: z.string().max(500).optional(),
});
export type PingStatusRequest = z.infer<typeof PingStatusSchema>;

export interface AgentStatsResponse {
  totalMessages: number;
  totalInbound: number;
  totalOutbound: number;
  successRequests: number;
  errorRequests: number;
  statusHistory: AgentStatusHistoryEntry[];
}

export interface GlobalStatsResponse {
  totalAgents: number;
  activeAgents: number;
  totalMessages: number;
  successRequests: number;
  errorRequests: number;
}
