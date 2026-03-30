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
  review?: unknown;
}
