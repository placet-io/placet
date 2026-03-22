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

// ── Core Entity Schemas ─────────────────────────────────────────────────────

export const ReviewCallbackSchema = z.object({
  url: z.string().url(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type ReviewCallback = z.infer<typeof ReviewCallbackSchema>;

export const ReviewSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
  status: ReviewStatusSchema,
  response: z.record(z.string(), z.unknown()).nullish(),
  callback: ReviewCallbackSchema.nullish(),
  expiresAt: z.string().nullish(),
  completedAt: z.string().nullish(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: UserRoleSchema,
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  apiKeyPrefix: z.string(),
  avatarUrl: z.string().url().nullish(),
  lastActiveAt: z.string().nullish(),
  createdAt: z.string(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const AttachmentSchema = z.object({
  id: z.string(),
  messageId: z.string(),
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
  agentId: z.string().nullish(),
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
});
export type CreateAgentRequest = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});
export type UpdateAgentRequest = z.infer<typeof UpdateAgentSchema>;

export const CreateAgentMessageSchema = z.object({
  text: z.string().optional(),
  status: MessageStatusSchema.optional(),
  review: ReviewSchema.omit({ status: true, response: true, completedAt: true }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateAgentMessageRequest = z.infer<typeof CreateAgentMessageSchema>;

export const CreateUserMessageSchema = z.object({
  channelId: z.string().min(1),
  text: z.string().min(1),
});
export type CreateUserMessageRequest = z.infer<typeof CreateUserMessageSchema>;

export const RespondReviewSchema = z.object({
  response: z.record(z.string(), z.unknown()),
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
  user: Pick<User, 'id' | 'email' | 'displayName' | 'role'>;
}

export interface CreateAgentResponse extends Agent {
  apiKey: string;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  fileKey: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string | null;
}
