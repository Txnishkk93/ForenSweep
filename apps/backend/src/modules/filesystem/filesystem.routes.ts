import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth } from "../../middleware/auth.js";
import { sendSuccess } from "../../lib/serialize.js";
import { browseLocalFs } from "./filesystem.service.js";

const querySchema = z.object({ path: z.string().max(4096).optional() });

export const filesystemRoutes: RouterType = Router();
filesystemRoutes.use(requireAuth);
filesystemRoutes.get(
  "/browse",
  asyncHandler(async (req, res) => {
    const query = querySchema.parse({ path: typeof req.query.path === "string" ? req.query.path : undefined });
    sendSuccess(res, await browseLocalFs(query.path), 200, { requestId: req.requestId });
  }),
);
