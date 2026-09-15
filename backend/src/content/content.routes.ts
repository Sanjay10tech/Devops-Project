import { Router } from "express";
import { Pool } from "pg";
import { ContentRepository } from "./content.repository";
import { ContentService } from "./content.service";
import { ContentController } from "./content.controller";
import { asyncHandler } from "../http/asyncHandler";
import { validate } from "../http/validate";
import {
  contentIdParamSchema,
  listContentQuerySchema,
  searchQuerySchema,
} from "./content.validation";

/** Wires the content feature (repository → service → controller → routes). */
export function createContentRouter(pool: Pool): Router {
  const repo = new ContentRepository(pool);
  const service = new ContentService(repo);
  const controller = new ContentController(service);

  const router = Router();

  // Home page payload: featured hero + category rows.
  router.get("/home", asyncHandler(controller.getHome));

  // Search must be declared before "/:id" so "search" isn't treated as an id.
  router.get(
    "/search",
    validate(searchQuerySchema, "query"),
    asyncHandler(controller.search)
  );

  // List / filter content.
  router.get(
    "/",
    validate(listContentQuerySchema, "query"),
    asyncHandler(controller.listContent)
  );

  // Content details.
  router.get(
    "/:id",
    validate(contentIdParamSchema, "params"),
    asyncHandler(controller.getById)
  );

  return router;
}
