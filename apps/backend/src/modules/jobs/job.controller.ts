import type { RequestHandler } from "express";
import { sendCreated, sendSuccess } from "../../lib/serialize.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  approveEraseJob,
  cancelJob,
  createEraseJob,
  createRecoveryJob,
  getJob,
  getJobAudit,
  listJobs,
  type JobStore,
} from "./job.service.js";
import type { JobQueue } from "../../lib/queues.js";

export function createJobController(store?: JobStore, queue?: JobQueue) {
  return {
    createErase: (async (req, res) =>
      sendCreated(
        res,
        await createEraseJob(req.body, req.auth!.userId, store, queue),
        { requestId: req.requestId },
      )) as RequestHandler,
    approve: (async (req, res) =>
      sendSuccess(
        res,
        await approveEraseJob(
          String(req.params.id),
          req.auth!.userId,
          store,
          queue,
          req.body?.approvalPassword,
        ),
        200,
        { requestId: req.requestId },
      )) as RequestHandler,
    cancel: (async (req, res) =>
      sendSuccess(
        res,
        await cancelJob(
          String(req.params.id),
          req.auth!.userId,
          req.auth!.role === "ADMIN",
          store,
        ),
        200,
        { requestId: req.requestId },
      )) as RequestHandler,
    recover: (async (req, res) =>
      sendCreated(
        res,
        await createRecoveryJob(req.body, req.auth!.userId, store, queue),
        { requestId: req.requestId },
      )) as RequestHandler,
    list: (async (req, res) =>
      sendSuccess(
        res,
        await listJobs(req.auth!.userId, req.auth!.role === "ADMIN", store),
        200,
        { requestId: req.requestId },
      )) as RequestHandler,
    get: (async (req, res) =>
      sendSuccess(
        res,
        await getJob(
          String(req.params.id),
          req.auth!.userId,
          req.auth!.role === "ADMIN",
          store,
        ),
        200,
        { requestId: req.requestId },
      )) as RequestHandler,
    audit: (async (req, res) =>
      sendSuccess(
        res,
        await getJobAudit(
          String(req.params.id),
          req.auth!.userId,
          req.auth!.role === "ADMIN",
          store,
        ),
        200,
        { requestId: req.requestId },
      )) as RequestHandler,
  };
}
