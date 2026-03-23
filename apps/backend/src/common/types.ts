export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  displayName?: string;
  mustChangePassword?: boolean;
}

export interface RequestWithUser {
  user: AuthenticatedUser;
}

// API-key-authenticated request — same shape as JWT-authenticated
// The ApiKeyGuard resolves the key's owning user onto req.user
export type RequestWithApiKey = RequestWithUser & {
  apiKeyId: string;
};
