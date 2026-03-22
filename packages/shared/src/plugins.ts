// ---------------------------------------------------------------------------
// HumanProxy – Plugin System Types & Schemas
// ---------------------------------------------------------------------------
// Defines the plugin manifest format, review types, and the bridge API
// contract between the platform and sandboxed plugin iframes.
// ---------------------------------------------------------------------------

import { z } from 'zod/v4';

// ── Plugin Manifest ─────────────────────────────────────────────────────────

export const PluginPermissionsSchema = z.object({
  httpRequests: z.boolean().optional(),
  maxHttpDomains: z.array(z.string()).optional(),
});
export type PluginPermissions = z.infer<typeof PluginPermissionsSchema>;

export const PluginManifestSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  version: z.string().min(1),
  author: z.string().optional(),
  icon: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  permissions: PluginPermissionsSchema.optional(),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// ── Review Types (built-in, NOT plugins) ────────────────────────────────────

export const ReviewTypeSchema = z.enum([
  'approval',
  'selection',
  'form',
  'text-input',
  'freeform',
]);
export type ReviewType = z.infer<typeof ReviewTypeSchema>;

// -- Approval

export const ApprovalOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  style: z.enum(['primary', 'danger', 'secondary', 'ghost']).optional(),
});

export const ApprovalInputSchema = z.object({
  options: z.array(ApprovalOptionSchema).min(1),
  allowComment: z.boolean().optional(),
});
export type ApprovalInput = z.infer<typeof ApprovalInputSchema>;

export const ApprovalResponseSchema = z.object({
  selectedOption: z.string().min(1),
  comment: z.string().optional(),
});
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

// -- Selection

export const SelectionItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const SelectionInputSchema = z.object({
  mode: z.enum(['single', 'multi']),
  items: z.array(SelectionItemSchema).min(1),
});
export type SelectionInput = z.infer<typeof SelectionInputSchema>;

export const SelectionResponseSchema = z.object({
  selectedIds: z.array(z.string().min(1)).min(1),
});
export type SelectionResponse = z.infer<typeof SelectionResponseSchema>;

// -- Form

export const FormFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['text', 'number', 'email', 'url', 'textarea', 'select', 'checkbox']),
  label: z.string().min(1),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const FormInputSchema = z.object({
  fields: z.array(FormFieldSchema).min(1),
  submitLabel: z.string().optional(),
});
export type FormInput = z.infer<typeof FormInputSchema>;

export const FormResponseSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type FormResponse = z.infer<typeof FormResponseSchema>;

// -- Text Input

export const TextInputInputSchema = z.object({
  placeholder: z.string().optional(),
  prefill: z.string().optional(),
  markdown: z.boolean().optional(),
  minLength: z.number().int().positive().optional(),
  maxLength: z.number().int().positive().optional(),
});
export type TextInputInput = z.infer<typeof TextInputInputSchema>;

export const TextInputResponseSchema = z.object({
  text: z.string().min(1),
});
export type TextInputResponse = z.infer<typeof TextInputResponseSchema>;

// -- Freeform (generic — used with custom plugin UIs)

export const FreeformInputSchema = z.object({}).passthrough();
export type FreeformInput = z.infer<typeof FreeformInputSchema>;

export const FreeformResponseSchema = z.record(z.string(), z.unknown());
export type FreeformResponse = z.infer<typeof FreeformResponseSchema>;

// ── Review Type Registry ────────────────────────────────────────────────────

export const reviewTypeSchemas: Record<
  ReviewType,
  { input: z.ZodType; response: z.ZodType }
> = {
  approval: { input: ApprovalInputSchema, response: ApprovalResponseSchema },
  selection: { input: SelectionInputSchema, response: SelectionResponseSchema },
  form: { input: FormInputSchema, response: FormResponseSchema },
  'text-input': { input: TextInputInputSchema, response: TextInputResponseSchema },
  freeform: { input: FreeformInputSchema, response: FreeformResponseSchema },
};

// ── Bridge API Types (postMessage contract) ─────────────────────────────────

export type BridgeMessageType =
  | 'hp:fetch'
  | 'hp:fetch:response'
  | 'hp:getFile'
  | 'hp:getFile:response'
  | 'hp:getFileUrl'
  | 'hp:getFileUrl:response'
  | 'hp:resize'
  | 'hp:toast'
  | 'hp:emit'
  | 'hp:event';

export interface BridgeMessage {
  type: BridgeMessageType;
  id?: string;
  payload?: unknown;
}

export interface BridgeFetchRequest {
  type: 'hp:fetch';
  id: string;
  payload: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

export interface BridgeFetchResponse {
  type: 'hp:fetch:response';
  id: string;
  payload: {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  } | {
    ok: false;
    error: string;
  };
}

export interface BridgeResizeMessage {
  type: 'hp:resize';
  payload: { height: number };
}

export interface BridgeToastMessage {
  type: 'hp:toast';
  payload: {
    message: string;
    variant?: 'info' | 'success' | 'warning' | 'error';
  };
}

export interface BridgeEmitMessage {
  type: 'hp:emit';
  payload: {
    action: string;
    data?: Record<string, unknown>;
  };
}

export interface BridgeEventMessage {
  type: 'hp:event';
  payload: {
    event: string;
    data?: unknown;
  };
}

export interface BridgeGetFileRequest {
  type: 'hp:getFile';
  id: string;
  payload: { attachmentId: string };
}

export interface BridgeGetFileResponse {
  type: 'hp:getFile:response';
  id: string;
  payload: {
    ok: true;
    data: string;
    mimeType: string;
    filename: string;
  } | {
    ok: false;
    error: string;
  };
}

export interface BridgeGetFileUrlRequest {
  type: 'hp:getFileUrl';
  id: string;
  payload: { attachmentId: string };
}

export interface BridgeGetFileUrlResponse {
  type: 'hp:getFileUrl:response';
  id: string;
  payload: {
    ok: true;
    url: string;
  } | {
    ok: false;
    error: string;
  };
}

// ── Attachment Info (passed to plugin context) ──────────────────────────────

export interface PluginAttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

// ── Plugin Renderer Props (for frontend) ────────────────────────────────────

export interface PluginRendererContext {
  pluginName: string;
  data: Record<string, unknown>;
  attachments: PluginAttachmentInfo[];
  message: {
    id: string;
    channelId: string;
    senderType: string;
    createdAt: string;
  };
  theme: 'light' | 'dark';
}
