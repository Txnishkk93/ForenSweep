import { apiFetch } from "./api-client";

export type AuthResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: "ADMIN" | "OPERATOR" | "INVESTIGATOR";
    createdAt: string;
  };
};

async function postAuth(
  path: "/login" | "/signup" | "/register",
  body: Record<string, string>,
): Promise<AuthResponse> {
  const response = await apiFetch<AuthResponse>(`/api/auth${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response;
}

export function login(identifier: string, password: string) {
  return postAuth("/login", { identifier, password });
}

export function signup(username: string, email: string, password: string) {
  return postAuth("/signup", { username, email, password });
}