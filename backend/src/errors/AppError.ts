/**
 * Application-level error with an HTTP status code and a stable error code.
 * Thrown by services/controllers and translated to a JSON response by the
 * centralized error handler.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static notFound(message = "Resource not found", details?: unknown): AppError {
    return new AppError(404, "NOT_FOUND", message, details);
  }

  static badRequest(message = "Bad request", details?: unknown): AppError {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static internal(message = "Internal server error", details?: unknown): AppError {
    return new AppError(500, "INTERNAL_ERROR", message, details);
  }
}
