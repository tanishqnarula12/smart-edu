import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Zod-backed request validation (§49).
 *
 * Validated output *replaces* the original property, so handlers work with
 * coerced, stripped values — a client cannot smuggle extra fields through.
 */

function formatIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));
}

function run(schema, value, source) {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = formatIssues(error);
      throw ApiError.unprocessable(
        `Validation failed for the request ${source}: ${issues[0].message}`,
        issues
      );
    }
    throw error;
  }
}

/** Validate `req.body`. */
export const validateBody = (schema) => (req, _res, next) => {
  try {
    req.body = run(schema, req.body ?? {}, 'body');
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Validate `req.query`. Express 5 exposes `req.query` as a getter, so the
 * parsed result is stashed on `req.validatedQuery` as well as being assigned
 * back where possible.
 */
export const validateQuery = (schema) => (req, _res, next) => {
  try {
    const parsed = run(schema, req.query ?? {}, 'query');
    req.validatedQuery = parsed;
    try {
      req.query = parsed;
    } catch {
      // Read-only getter (Express 5) — handlers use req.validatedQuery.
    }
    next();
  } catch (error) {
    next(error);
  }
};

/** Validate `req.params`. */
export const validateParams = (schema) => (req, _res, next) => {
  try {
    req.params = run(schema, req.params ?? {}, 'parameters');
    next();
  } catch (error) {
    next(error);
  }
};

/** Validate several sources in one call. */
export const validate = ({ body, query, params }) => (req, _res, next) => {
  try {
    if (params) req.params = run(params, req.params ?? {}, 'parameters');
    if (query) {
      const parsed = run(query, req.query ?? {}, 'query');
      req.validatedQuery = parsed;
      try {
        req.query = parsed;
      } catch {
        /* see validateQuery */
      }
    }
    if (body) req.body = run(body, req.body ?? {}, 'body');
    next();
  } catch (error) {
    next(error);
  }
};

export default { validate, validateBody, validateQuery, validateParams };
