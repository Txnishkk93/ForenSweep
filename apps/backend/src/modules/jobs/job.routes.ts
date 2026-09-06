import { Router, type Router as RouterType } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { sendSuccess } from "../../lib/serialize.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { createJobController } from "./job.controller.js";
import { getJobSummary, listAuditEvents } from "./job.service.js";
import {
  createEraseJobSchema,
  createRecoveryJobSchema,
  jobIdParamsSchema,
  approveJobSchema,
} from "./job.schemas.js";
import type { JobStore } from "./job.service.js";
import type { JobQueue } from "../../lib/queues.js";

export function createJobRoutes(
  store?: JobStore,
  queue?: JobQueue,
): RouterType {
  const routes = Router();
  const controller = createJobController(store, queue);
  routes.use(requireAuth);
  routes.post(
    "/erase",
    requireRole("OPERATOR", "ADMIN"),
    validateBody(createEraseJobSchema),
    asyncHandler(controller.createErase),
  );
  routes.post(
    "/recover",
    requireRole("OPERATOR", "INVESTIGATOR", "ADMIN"),
    validateBody(createRecoveryJobSchema),
    asyncHandler(controller.recover),
  );
  routes.post(
    "/:id/approve",
    requireRole("ADMIN"),
    validateParams(jobIdParamsSchema),
    validateBody(approveJobSchema),
    asyncHandler(controller.approve),
  );
  routes.post(
    "/:id/cancel",
    validateParams(jobIdParamsSchema),
    asyncHandler(controller.cancel),
  );
  routes.get(
    "/summary",
    asyncHandler(async (req, res) =>
      sendSuccess(res, await getJobSummary(req.auth!.userId, req.auth!.role === "ADMIN"), 200, {
        requestId: req.requestId,
      }),
    ),
  );
  routes.get(
    "/audit",
    asyncHandler(async (req, res) =>
      sendSuccess(res, await listAuditEvents(req.auth!.userId, req.auth!.role === "ADMIN"), 200, {
        requestId: req.requestId,
      }),
    ),
  );
  routes.get(
    "/:id/audit",
    validateParams(jobIdParamsSchema),
    asyncHandler(controller.audit),
  );
  routes.get(
    "/:id",
    validateParams(jobIdParamsSchema),
    asyncHandler(controller.get),
  );
  routes.get("/", asyncHandler(controller.list));
  return routes;
}

export const jobRoutes: RouterType = createJobRoutes();
