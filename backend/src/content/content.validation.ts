import { z } from "zod";

/** Query params for listing content. */
export const listContentQuerySchema = z.object({
  category: z.string().trim().min(1).max(64).optional(),
  type: z.enum(["movie", "show"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Query params for search. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query 'q' is required").max(128),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Route param for a single content id (UUID). */
export const contentIdParamSchema = z.object({
  id: z.string().uuid("Invalid content id"),
});

export type ListContentQuery = z.infer<typeof listContentQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
