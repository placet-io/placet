export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  displayName?: string;
}

export interface AuthenticatedAgent {
  id: string;
  name: string;
  ownerId: string;
}

export interface RequestWithUser {
  user: AuthenticatedUser;
}

export interface RequestWithAgent {
  agent: AuthenticatedAgent;
  user: { id: string };
}
