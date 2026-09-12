import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { createToken } from "../../lib/jwt.js";
import type { LoginInput, SignupInput } from "./auth.schemas.js";
import type { AuthUser, PublicUser } from "./auth.types.js";

export type UserStore = Pick<typeof prisma, "user">;

export async function authenticateUser(
  identifier: string,
  password: string,
  userStore: UserStore = prisma,
): Promise<AuthUser | null> {
  const normalizedIdentifier = identifier.trim();
  const user = await userStore.user.findFirst({
    where: {
      OR: [
        { username: normalizedIdentifier },
        { email: normalizedIdentifier.toLowerCase() },
      ],
    },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return null;
  return user as AuthUser;
}

export function toPublicUser(user: AuthUser): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export async function login(
  input: LoginInput,
  userStore: UserStore = prisma,
): Promise<{
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: PublicUser;
} | null> {
  const user = await authenticateUser(
    input.identifier,
    input.password,
    userStore,
  );
  if (!user) return null;
  return {
    accessToken: createToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    }),
    tokenType: "Bearer",
    expiresIn: "8h",
    user: toPublicUser(user),
  };
}

export async function signup(
  input: SignupInput,
  userStore: UserStore = prisma,
): Promise<{
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: PublicUser;
}> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const existingUser = await userStore.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existingUser) {
    throw new Error("USER_ALREADY_EXISTS");
  }

  const user = (await userStore.user.create({
    data: {
      username,
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "OPERATOR",
    },
  })) as AuthUser;

  return {
    accessToken: createToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    }),
    tokenType: "Bearer",
    expiresIn: "8h",
    user: toPublicUser(user),
  };
}

export async function getUserById(
  id: string,
  userStore: UserStore = prisma,
): Promise<PublicUser | null> {
  const user = await userStore.user.findUnique({ where: { id } });
  return user ? toPublicUser(user as AuthUser) : null;
}
