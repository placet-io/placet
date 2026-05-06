export interface ResponseBody {
  status?: string;
  timestamp?: string;
  message?: string;
  data?: unknown[];
  theme?: string;
  key?: string;
  id?: string;
  label?: string;
  deleted?: boolean;
  user?: { id: string; email: string; mustChangePassword?: boolean };
  accessToken?: string;
}

export interface MessageResponse {
  id: string;
  channelId: string;
  senderType: string;
  text?: string;
  status?: string;
  streamId?: string | null;
  streamState?: 'streaming' | 'complete' | 'aborted' | null;
  statusEvents?: Array<{
    id: string;
    channelId: string;
    streamId: string;
    index: number;
    text: string;
    toolHint: boolean;
    createdAt: string;
  }>;
  review?: unknown;
  deliveryStatus?: string;
  attachments?: Array<{ id: string; filename: string; mimeType: string }>;
}
