import { Router, type Router as RouterType } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth } from "../../middleware/auth.js";
import { sendSuccess } from "../../lib/serialize.js";
import { listAvailableImages } from "./acquisition.service.js";

export const acquisitionRoutes: RouterType = Router();
acquisitionRoutes.use(requireAuth);
acquisitionRoutes.get(
  "/available-images",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await listAvailableImages(), 200, { requestId: req.requestId }),
  ),
);