import { Router, type Router as RouterType } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { validateParams } from "../../middleware/validate.js";
import { createDeviceController } from "./device.controller.js";
import { deviceIdParamsSchema, erasePreviewSchema } from "./device.schemas.js";
import type { DeviceStore } from "./device.service.js";

export function createDeviceRoutes(store?: DeviceStore): RouterType {
  const routes = Router();
  const controller = createDeviceController(store);
  routes.use(requireAuth);
  routes.get("/", asyncHandler(controller.list));
  routes.get(
    "/:id/profile",
    validateParams(deviceIdParamsSchema),
    asyncHandler(controller.profile),
  );
  routes.get(
    "/:id/browse",
    validateParams(deviceIdParamsSchema),
    asyncHandler(controller.browse),
  );
  routes.get(
    "/:id",
    validateParams(deviceIdParamsSchema),
    asyncHandler(controller.get),
  );
  routes.post("/refresh", asyncHandler(controller.refresh));
  return routes;
}

export const deviceRoutes: RouterType = createDeviceRoutes();

export function createErasePreviewRoutes(store?: DeviceStore): RouterType {
  const routes = Router();
  routes.post(
    "/erase/preview",
    requireAuth,
    validateBody(erasePreviewSchema),
    asyncHandler(createDeviceController(store).preview),
  );
  return routes;
}

export const erasePreviewRoutes: RouterType = createErasePreviewRoutes();
