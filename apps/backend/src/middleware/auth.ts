import type { RequestHandler } from "express";
import { verifyToken } from "../lib/jwt.js";
import { AppError } from "./error-handler.js";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  if (!header) {
    next(
      new AppError(
        401,
        "AUTH_TOKEN_MISSING",
        "Authentication token is required",
      ),
    );
    return;
  }
  const [scheme, token, ...extra] = header.split(" ");
  if (scheme !== "Bearer" || !token || extra.length > 0) {
    next(
      new AppError(
        401,
        "AUTH_TOKEN_INVALID",
        "Authentication token is invalid",
      ),
    );
    return;
  }
  try {
    const claims = verifyToken(token);
    req.auth = {
      userId: claims.sub,
      username: claims.username,
      role: claims.role,
    };
    next();
  } catch {
    next(
      new AppError(
        401,
        "AUTH_TOKEN_INVALID",
        "Authentication token is invalid",
      ),
    );
  }
};

export function requireRole(
  ...allowedRoles: Array<NonNullable<Express.Request["auth"]>["role"]>
): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      next(
        new AppError(
          403,
          "FORBIDDEN",
          "You do not have permission to access this resource",
          {
            authorizationCheck: req.auth
              ? `role ${req.auth.role} not in required [${allowedRoles.join(", ")}]`
              : "no valid authentication context",
          },
        ),
      );
      return;
    }
    next();
  };
}
