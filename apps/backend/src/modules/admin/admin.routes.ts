import { Router, type Router as RouterType } from "express";
import { sendSuccess } from "../../lib/serialize.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

export const adminRoutes: RouterType = Router();
adminRoutes.get("/ping", requireAuth, requireRole("ADMIN"), (req, res) => {
  sendSuccess(res, { message: "Admin access confirmed", user: req.auth }, 200, {
    requestId: req.requestId,
  });
});
