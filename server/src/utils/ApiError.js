/**
 * Operational error carrying an HTTP status. Anything thrown that is *not* an
 * ApiError is treated as a bug by the error middleware and its details are
 * hidden from the client in production.
 */
export class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Invalid request', errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'That record already exists') {
    return new ApiError(409, message);
  }

  static unprocessable(message = 'Validation failed', errors = []) {
    return new ApiError(422, message, errors);
  }

  static tooManyRequests(message = 'Too many requests, please slow down') {
    return new ApiError(429, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message);
  }
}

export default ApiError;
