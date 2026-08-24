import { ApiError } from '../utils/ApiError.js';
import { config } from '../config/env.js';

/**
 * Centralised error handler (§61).
 *
 * Never leaks stack traces, SQL, connection strings or hashes to a client.
 * Unexpected errors become a generic 500 in production while the full detail
 * goes to the server log.
 */

// PostgreSQL error codes we can turn into a helpful message safely.
const PG_ERRORS = {
  '23505': { status: 409, message: 'A record with these details already exists' },
  '23503': { status: 400, message: 'Referenced record does not exist' },
  '23502': { status: 400, message: 'A required field is missing' },
  '23514': { status: 400, message: 'A value is outside the allowed range' },
  '22P02': { status: 400, message: 'Malformed identifier or value' },
  '22007': { status: 400, message: 'Invalid date or time value' },
  '42703': { status: 400, message: 'Unknown field requested' },
};

/** Turn `attendance_unique_per_day` into something a human can act on. */
function describeConstraint(constraint) {
  const messages = {
    attendance_unique_per_day: 'Attendance has already been recorded for this student, subject and date',
    marks_unique_per_assessment: 'Marks have already been entered for this student in this assessment',
    submission_unique: 'You have already submitted this assignment',
    users_email_uniq: 'An account with this e-mail already exists',
    enrollment_unique: 'This student is already enrolled in that class',
    parent_student_unique: 'This parent is already linked to that student',
    student_roll_unique_per_class: 'That roll number is already used in this class',
    teacher_subject_class_unique: 'This teacher is already assigned to that subject and class',
    classes_unique_per_year: 'A class with that name and section already exists for this academic year',
    fee_record_unique: 'A fee record for this student and structure already exists',
    ptm_bookings_active_slot_uniq: 'That meeting slot has already been booked',
    ptm_slot_unique: 'You already have a slot at that time',
    fee_paid_within_total: 'Payment exceeds the outstanding amount',
  };
  return messages[constraint] || null;
}

export function errorHandler(error, req, res, _next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Something went wrong';
  let errors = error.errors || [];

  // Database errors → safe, specific messages.
  if (error.code && PG_ERRORS[error.code]) {
    const mapped = PG_ERRORS[error.code];
    statusCode = mapped.status;
    message = describeConstraint(error.constraint) || mapped.message;
    errors = [];
  } else if (error.code === 'ECONNREFUSED' || error.code === '57P01') {
    statusCode = 503;
    message = 'The database is unavailable. Please try again shortly.';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Session expired, please sign in again';
  } else if (error.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request payload is too large';
  } else if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body is not valid JSON';
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = `File exceeds the ${config.storage.maxFileSizeMb}MB limit`;
  }

  const isUnexpected = !(error instanceof ApiError) && statusCode >= 500;

  if (isUnexpected) {
    console.error(
      `[error] ${req.method} ${req.originalUrl} — ${error.message}\n${error.stack ?? ''}`
    );
    if (config.isProduction) {
      message = 'Something went wrong. Please try again.';
      errors = [];
    }
  } else if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} — ${error.message}`);
  }

  const body = { success: false, message, errors };

  // Stack traces are a development affordance only.
  if (!config.isProduction && isUnexpected) {
    body.stack = error.stack;
  }

  res.status(statusCode).json(body);
}

/** 404 for anything that reached the API without matching a route. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
}

export default { errorHandler, notFoundHandler };
