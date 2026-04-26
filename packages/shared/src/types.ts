// ---------------------------------------------------------------------------
// Placet – Shared Zod Schemas & Inferred Types
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

// ── Agent Commands ──────────────────────────────────────────────────────────

export const AgentCommandSchema = z.object({
  command: z.string(),
  description: z.string(),
  acceptsArgs: z.boolean().optional(),
  argHint: z.string().optional(),
});
export type AgentCommand = z.infer<typeof AgentCommandSchema>;

export const DeliveryStatusSchema = z.enum([
  'sent',
  'webhook_delivered',
  'webhook_failed',
  'agent_received',
]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

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
  /** Human feedback text provided alongside the review response. */
  feedback: z.string().nullish(),
  /** Mapping of original attachment ID → modified file ID for edited/annotated files. */
  modifiedFileIds: z.record(z.string(), z.string()).nullish(),
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
  commands: z.array(AgentCommandSchema).nullish(),
  tag: z.string().nullish(),
  /** Facio management API base URL (e.g. https://facio.example.com). */
  managementUrl: z.string().url().nullish(),
  /** Masked (`***`) when the agent has a management API key configured. */
  managementApiKey: z.string().nullish(),
  /** True for HITL sub-channels; hidden from the management dashboard. */
  isSubagent: z.boolean().optional(),
  parentAgentId: z.string().nullish(),
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
  deliveryStatus: DeliveryStatusSchema.optional(),
  iterationGroupId: z.string().nullish(),
  iteration: z.number().int().nullish(),
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
  managementDashboard: z.boolean(),
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
  tag: z.string().max(64).optional(),
});
export type CreateAgentRequest = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  webhookUrl: z.string().url().nullable().optional(),
  webhookHeaders: z.record(z.string(), z.string()).nullable().optional(),
  webhookAuth: WebhookAuthSchema.nullable().optional(),
  tag: z.string().max(64).nullable().optional(),
  managementUrl: z.string().url().nullable().optional(),
  managementApiKey: z.string().min(1).nullable().optional(),
});
export type UpdateAgentRequest = z.infer<typeof UpdateAgentSchema>;

export const ManagementCredentialsSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().min(1),
});
export type ManagementCredentials = z.infer<typeof ManagementCredentialsSchema>;

export const SetManagementSchema = z.object({
  channelId: z.string().min(1),
  url: z.string().url().nullable(),
  apiKey: z.string().min(1).nullable(),
});
export type SetManagementRequest = z.infer<typeof SetManagementSchema>;

export const SetSubagentSchema = z
  .object({
    channelId: z.string().min(1),
    isSubagent: z.boolean(),
    /** Parent channel id when `isSubagent` is true; ignored otherwise. */
    parentChannelId: z.string().min(1).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.isSubagent && !val.parentChannelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentChannelId'],
        message: 'parentChannelId is required when isSubagent is true',
      });
    }
    if (!val.isSubagent && val.parentChannelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentChannelId'],
        message: 'parentChannelId must be null when isSubagent is false',
      });
    }
    if (val.parentChannelId && val.parentChannelId === val.channelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentChannelId'],
        message: 'A channel cannot be its own parent',
      });
    }
  });
export type SetSubagentRequest = z.infer<typeof SetSubagentSchema>;

export const SetTagSchema = z.object({
  channelId: z.string().min(1),
  tag: z.string().max(64).nullable(),
});
export type SetTagRequest = z.infer<typeof SetTagSchema>;

export const UpdateAgentCommandsSchema = z.object({
  commands: z.array(AgentCommandSchema),
});
export type UpdateAgentCommandsRequest = z.infer<typeof UpdateAgentCommandsSchema>;

export const SetWebhookSchema = z
  .object({
    url: z.string().url(),
    channelId: z.string().min(1),
    headers: z.record(z.string(), z.string()).optional(),
    auth: WebhookAuthSchema.optional(),
    /** Optional Facio management creds to register together with the main webhook. */
    management: ManagementCredentialsSchema.optional(),
    /** True if this channel is a HITL sub-channel (hidden from management UI). */
    isSubagent: z.boolean().optional(),
    /** Channel id of the parent agent when `isSubagent` is true. */
    parentChannelId: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.isSubagent === true && !val.parentChannelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentChannelId'],
        message: 'parentChannelId is required when isSubagent is true',
      });
    }
    if (val.isSubagent === false && val.parentChannelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentChannelId'],
        message: 'parentChannelId must not be set when isSubagent is false',
      });
    }
    if (val.parentChannelId && val.parentChannelId === val.channelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentChannelId'],
        message: 'A channel cannot be its own parent',
      });
    }
  });
export type SetWebhookRequest = z.infer<typeof SetWebhookSchema>;

export const DeleteWebhookSchema = z.object({
  channelId: z.string().min(1),
});
export type DeleteWebhookRequest = z.infer<typeof DeleteWebhookSchema>;

export const CreateApiKeySchema = z.object({
  label: z.string().min(1).max(64).optional(),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeySchema>;

export const TextAttachmentSchema = z.object({
  /** The text content to store as a file */
  content: z.string().min(1),
  /** Filename for the stored file */
  filename: z.string().min(1).default('content.md'),
  /** MIME type of the content */
  mimeType: z.string().default('text/markdown'),
});
export type TextAttachment = z.infer<typeof TextAttachmentSchema>;

export const CreateAgentMessageSchema = z
  .object({
    channelId: z.string().min(1),
    text: z.string().optional(),
    status: MessageStatusSchema.optional(),
    review: ReviewSchema.omit({ status: true, response: true, completedAt: true }).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    webhookUrl: z.string().url().optional(),
    attachmentIds: z.array(z.string()).optional(),
    /** Inline text content to be stored as file attachments automatically */
    textAttachments: z.array(TextAttachmentSchema).optional(),
    /** Message ID of the previous iteration this message follows up on. */
    iterationOf: z.string().optional(),
    /** Idempotency key supplied by the agent. Safe retries reuse the same id. */
    clientId: z.string().optional(),
  })
  .refine(
    (d) =>
      d.text ||
      d.review ||
      d.status ||
      (d.attachmentIds && d.attachmentIds.length > 0) ||
      (d.textAttachments && d.textAttachments.length > 0),
    {
      message:
        'Message must contain at least one of: text, review, status, attachmentIds, or textAttachments',
    },
  );
export type CreateAgentMessageRequest = z.infer<typeof CreateAgentMessageSchema>;

export const CreateUserMessageSchema = z
  .object({
    channelId: z.string().min(1),
    text: z.string().optional(),
    attachmentIds: z.array(z.string()).optional(),
    clientId: z.string().min(1).optional(),
  })
  .refine((d) => d.text || (d.attachmentIds && d.attachmentIds.length > 0), {
    message: 'Message must contain at least text or attachmentIds',
  });
export type CreateUserMessageRequest = z.infer<typeof CreateUserMessageSchema>;

export const RespondReviewSchema = z.object({
  response: z.record(z.string(), z.unknown()),
  /** Mapping of original attachment ID → modified file ID for edited/annotated files */
  modifiedFileIds: z.record(z.string(), z.string()).optional(),
  /** Human feedback text explaining what needs to change. */
  feedback: z.string().optional(),
});
export type RespondReviewRequest = z.infer<typeof RespondReviewSchema>;

export const PresignUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
});
export type PresignUploadRequest = z.infer<typeof PresignUploadSchema>;

export const UpdatePreferencesSchema = z.object({
  theme: ThemeSchema.optional(),
  managementDashboard: z.boolean().optional(),
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
