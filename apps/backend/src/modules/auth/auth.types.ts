export type AuthRole = "ADMIN" | "OPERATOR" | "INVESTIGATOR";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  createdAt: Date;
};

export type PublicUser = Omit<AuthUser, "passwordHash">;
