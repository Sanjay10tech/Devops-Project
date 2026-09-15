import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../errors/AppError";

type Source = "query" | "params" | "body";

/**
 * Returns middleware that validates the given request part against a Zod schema
 * and replaces it with the parsed (typed, coerced) value. On failure it throws
 * a 400 AppError with field-level details.
 */
export function validate(schema: ZodSchema, source: Source) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      next(AppError.badRequest("Validation failed", details));
      return;
    }
    // Store parsed value on a dedicated property to avoid reassigning req.query
    // (which is a getter-only in some Express versions).
    (req as Request & { validated?: Record<string, unknown> }).validated = {
      ...(req as Request & { validated?: Record<string, unknown> }).validated,
      [source]: result.data,
    };
    next();
  };
}

/** Type-safe accessor for validated data attached by the middleware. */
export function getValidated<T>(req: Request, source: Source): T {
  return (req as Request & { validated: Record<string, unknown> }).validated[
    source
  ] as T;
}
