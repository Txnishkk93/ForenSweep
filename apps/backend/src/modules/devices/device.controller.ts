import type { RequestHandler } from "express";
import { sendSuccess } from "../../lib/serialize.js";
import {
  getDevice,
  getDeviceProfile,
  listDevices,
  previewErase,
  refreshDevices,
  type DeviceStore,
} from "./device.service.js";

export function createDeviceController(store?: DeviceStore) {
  return {
    list: (async (req, res) =>
      sendSuccess(res, await listDevices(store), 200, {
        requestId: req.requestId,
      })) as RequestHandler,
    get: (async (req, res) =>
      sendSuccess(res, await getDevice(String(req.params.id), store), 200, {
        requestId: req.requestId,
      })) as RequestHandler,
    profile: (async (req, res) =>
      sendSuccess(
        res,
        await getDeviceProfile(String(req.params.id), store),
        200,
        { requestId: req.requestId },
      )) as RequestHandler,
    refresh: (async (req, res) =>
      sendSuccess(res, await refreshDevices(req.auth!.userId, store), 200, {
        requestId: req.requestId,
      })) as RequestHandler,
    preview: (async (req, res) =>
      sendSuccess(
        res,
        await previewErase(req.body, req.auth!.userId, store),
        200,
        { requestId: req.requestId },
      )) as RequestHandler,
  };
}
