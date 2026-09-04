import { Router, type Router as RouterType } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { loginSchema } from "./auth.schemas.js";
import { createAuthController } from "./auth.controller.js";
import type { UserStore } from "./auth.service.js";

export function createAuthRoutes(userStore?: UserStore): RouterType {
  const routes = Router();
  const controller = createAuthController(userStore);
  routes.post(
    "/login",
    validateBody(loginSchema),
    asyncHandler(controller.login),
  );
  routes.get("/me", requireAuth, asyncHandler(controller.me));
  return routes;
}

export const authRoutes: RouterType = createAuthRoutes();
