/**
 * The single response shape used by every endpoint (§42).
 *
 *   success: { success: true,  data, message, meta? }
 *   error:   { success: false, message, errors: [] }
 */

export function sendSuccess(res, data = null, message = 'Operation successful', statusCode = 200, meta) {
  const body = { success: true, data, message };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendCreated(res, data, message = 'Created successfully') {
  return sendSuccess(res, data, message, 201);
}

export function sendPaginated(res, items, pagination, message = 'Operation successful') {
  return res.status(200).json({
    success: true,
    data: items,
    message,
    meta: { pagination },
  });
}

export function sendError(res, statusCode, message, errors = []) {
  return res.status(statusCode).json({ success: false, message, errors });
}

export default { sendSuccess, sendCreated, sendPaginated, sendError };
