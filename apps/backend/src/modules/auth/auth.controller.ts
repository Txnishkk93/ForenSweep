import type { RequestHandler } from "express";
import { env } from "../../config/env.js";
import { sendSuccess } from "../../lib/serialize.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { getUserById, login, type UserStore } from "./auth.service.js";

export function createAuthController(userStore: UserStore = prisma): {
  login: RequestHandler;
  me: RequestHandler;
} {
  return {
    login: async (req, res) => {
      const result = await login(req.body, userStore);
      if (!result)
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "Invalid username/email or password",
        );
      result.expiresIn = env.JWT_EXPIRES_IN;
      sendSuccess(res, result, 200, { requestId: req.requestId });
    },
    me: async (req, res) => {
      const user = await getUserById(req.auth!.userId, userStore);
      if (!user)
        throw new AppError(
          401,
          "AUTH_TOKEN_INVALID",
          "Session is no longer valid",
        );
      sendSuccess(res, user, 200, { requestId: req.requestId });
    },
  };
}

const defaultController = createAuthController();
export const loginController: RequestHandler = defaultController.login;
export const meController: RequestHandler = defaultController.me;
