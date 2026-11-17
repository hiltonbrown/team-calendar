import type { AuthRole } from "./permissions";

export interface AuthSession {
  accountId: string | null;
  role: AuthRole | null;
  sessionId: string | null;
  userId: string;
}

export interface AuthUser {
  email: string | null;
  emailVerified: boolean;
  id: string;
  image: string | null;
  name: string | null;
}
