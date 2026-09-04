import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type AccessTokenClaims = {
  sub: string;
  username: string;
  role: "ADMIN" | "OPERATOR" | "INVESTIGATOR";
};

const issuer = "forensweep-api";
const audience = "forensweep-web";

export function createToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    issuer,
    audience,
  });
}

export function verifyToken(token: string): AccessTokenClaims {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer,
    audience,
  }) as JwtPayload & Partial<AccessTokenClaims>;
  if (
    !payload.sub ||
    !payload.username ||
    !payload.role ||
    !["ADMIN", "OPERATOR", "INVESTIGATOR"].includes(payload.role)
  ) {
    throw new Error("Invalid token claims");
  }
  return { sub: payload.sub, username: payload.username, role: payload.role };
}
