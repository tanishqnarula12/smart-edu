import crypto from 'node:crypto';
import { queryOne, queryMany, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { config } from '../config/env.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import * as access from '../services/accessService.js';
import { notify, NOTIFICATION_TYPES } from '../services/notificationService.js';

/**
 * Fees and payments (§31).
 *
 * The payment flow is provider-shaped (create order → verify → settle) so
 * swapping the mock provider for Razorpay is a matter of filling in two
 * functions, not rewriting the endpoints. With no keys configured the mock
 * provider settles instantly and the UI says so.
 */

const providerName = () => (config.payments.enabled ? 'razorpay' : 'mock');

/** Recompute status from the amounts — never trust a client-sent status. */
function deriveStatus(total, paid, dueDate) {
  if (paid >= total) return 'paid';
  if (new Date(dueDate) < new Date()) return 'overdue';
  if (paid > 0) return 'partial';
  return 'pending';
}

/**
 * Which student's fees is the caller asking about?
 *
 * A parent who names no student gets their first linked child, matching how
 * /parents/dashboard behaves — asking a parent with one child to supply an id
 * they cannot see would be pointless friction.
 */
async function resolveStudentId(req) {
  if (req.user.role === 'student') return req.user.id;

  const requested = req.query.studentId || req.params.studentId;

  if (req.user.role === 'parent') {
    if (requested) {
      await access.assertParentCanView(req.user.id, requested, 'fees');
      return requested;
    }

    const children = await access.getLinkedChildren(req.user.id);
    if (!children.length) {
      throw ApiError.notFound('No children are linked to your account');
    }

    // Prefer a child who has actually shared their fees.
    const shared = children.find((child) => child.permissions.fees);
    if (!shared) {
      throw ApiError.forbidden(`${children[0].name} has not shared their fee records with you`);
    }
    return shared.id;
  }

  if (req.user.role === 'admin') {
    if (!requested) throw ApiError.badRequest('A studentId is required');
    return requested;
  }

  throw ApiError.forbidden('Fee records are visible to students, their parents and administrators');
}

/** GET /api/fees — a student's fee records and running balance. */
export const getStudentFees = asyncHandler(async (req, res) => {
  const studentId = await resolveStudentId(req);

  const records = await queryMany(
    `SELECT fr.id, fr.total_amount, fr.paid_amount, fr.status, fr.due_date, fr.created_at,
            fs.name, fs.description, fs.academic_year
       FROM fee_records fr
       JOIN fee_structures fs ON fs.id = fr.fee_structure_id
      WHERE fr.student_id = $1
      ORDER BY fr.due_date DESC`,
    [studentId]
  );

  const payments = await queryMany(
    `SELECT p.id, p.amount, p.method, p.status, p.provider, p.receipt_no, p.paid_at, p.created_at,
            fs.name AS fee_name
       FROM payments p
       JOIN fee_records fr    ON fr.id = p.fee_record_id
       JOIN fee_structures fs ON fs.id = fr.fee_structure_id
      WHERE p.student_id = $1
      ORDER BY p.created_at DESC
      LIMIT 50`,
    [studentId]
  );

  const totals = records.reduce(
    (acc, record) => {
      acc.total += Number(record.total_amount);
      acc.paid += Number(record.paid_amount);
      return acc;
    },
    { total: 0, paid: 0 }
  );

  return sendSuccess(
    res,
    {
      summary: {
        totalAmount: Number(totals.total.toFixed(2)),
        paidAmount: Number(totals.paid.toFixed(2)),
        pendingAmount: Number((totals.total - totals.paid).toFixed(2)),
        overdueCount: records.filter((record) => record.status === 'overdue').length,
      },
      records: records.map((record) => ({
        id: record.id,
        name: record.name,
        description: record.description,
        academicYear: record.academic_year,
        totalAmount: Number(record.total_amount),
        paidAmount: Number(record.paid_amount),
        pendingAmount: Number((record.total_amount - record.paid_amount).toFixed(2)),
        status: record.status,
        dueDate: record.due_date,
      })),
      payments,
      paymentMode: providerName(),
      mockMode: !config.payments.enabled,
    },
    'Fee details'
  );
});

/** GET /api/fees/structures — admin. */
export const listStructures = asyncHandler(async (_req, res) => {
  const rows = await queryMany(
    `SELECT fs.*, c.name AS class_name, c.section,
            (SELECT COUNT(*) FROM fee_records fr WHERE fr.fee_structure_id = fs.id)::int AS record_count,
            (SELECT COALESCE(SUM(fr.paid_amount), 0) FROM fee_records fr WHERE fr.fee_structure_id = fs.id)
              AS collected
       FROM fee_structures fs
       LEFT JOIN classes c ON c.id = fs.class_id
      ORDER BY fs.due_date DESC`
  );
  return sendSuccess(res, rows, 'Fee structures');
});

/**
 * POST /api/fees/structures — admin.
 * Creating a structure also raises a fee record for every student in scope,
 * inside one transaction so a partial roll-out cannot happen.
 */
export const createStructure = asyncHandler(async (req, res) => {
  const { name, classId, academicYear, amount, description, dueDate } = req.body;

  const result = await withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO fee_structures (name, class_id, academic_year, amount, description, due_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, classId ?? null, academicYear, amount, description ?? null, dueDate]
    );
    const structure = rows[0];

    const { rowCount } = await tx.query(
      `INSERT INTO fee_records (student_id, fee_structure_id, total_amount, due_date)
       SELECT sp.user_id, $1, $2, $3::date
         FROM student_profiles sp
         JOIN users u ON u.id = sp.user_id AND u.is_active
        WHERE ($4::uuid IS NULL OR sp.class_id = $4::uuid)
       ON CONFLICT (student_id, fee_structure_id) DO NOTHING`,
      [structure.id, amount, dueDate, classId ?? null]
    );

    return { structure, recordsCreated: rowCount };
  });

  return sendCreated(
    res,
    result,
    `Fee structure created and raised for ${result.recordsCreated} student(s)`
  );
});

/** GET /api/fees/overview — admin collection summary. */
export const getOverview = asyncHandler(async (_req, res) => {
  const summary = await queryOne(
    `SELECT COALESCE(SUM(total_amount), 0)                                  AS billed,
            COALESCE(SUM(paid_amount), 0)                                   AS collected,
            COUNT(*)::int                                                   AS records,
            COUNT(*) FILTER (WHERE status = 'paid')::int                    AS paid,
            COUNT(*) FILTER (WHERE status = 'partial')::int                 AS partial,
            COUNT(*) FILTER (WHERE status = 'pending')::int                 AS pending,
            COUNT(*) FILTER (WHERE status = 'overdue')::int                 AS overdue
       FROM fee_records`
  );

  const byClass = await queryMany(
    `SELECT c.id AS class_id, c.name AS class_name, c.section,
            COALESCE(SUM(fr.total_amount), 0) AS billed,
            COALESCE(SUM(fr.paid_amount), 0)  AS collected
       FROM classes c
       LEFT JOIN student_profiles sp ON sp.class_id = c.id
       LEFT JOIN fee_records fr      ON fr.student_id = sp.user_id
      GROUP BY c.id, c.name, c.section
      ORDER BY c.name, c.section`
  );

  const billed = Number(summary.billed);
  const collected = Number(summary.collected);

  return sendSuccess(
    res,
    {
      billed,
      collected,
      outstanding: Number((billed - collected).toFixed(2)),
      collectionRate: billed ? Number(((collected / billed) * 100).toFixed(2)) : 0,
      counts: {
        records: summary.records,
        paid: summary.paid,
        partial: summary.partial,
        pending: summary.pending,
        overdue: summary.overdue,
      },
      byClass: byClass.map((row) => ({
        classId: row.class_id,
        className: `${row.class_name} ${row.section}`,
        billed: Number(row.billed),
        collected: Number(row.collected),
        outstanding: Number((row.billed - row.collected).toFixed(2)),
      })),
    },
    'Fee overview'
  );
});

/**
 * POST /api/payments — start a payment.
 *
 * With Razorpay configured this is where an order would be created against
 * their API; the mock provider generates an equivalent local order id.
 */
export const createPayment = asyncHandler(async (req, res) => {
  const { feeRecordId, amount, method } = req.body;

  const record = await queryOne(
    `SELECT fr.*, fs.name FROM fee_records fr
       JOIN fee_structures fs ON fs.id = fr.fee_structure_id
      WHERE fr.id = $1`,
    [feeRecordId]
  );
  if (!record) throw ApiError.notFound('Fee record not found');

  // Students pay their own fees; parents pay for children who shared fees.
  if (req.user.role === 'student' && record.student_id !== req.user.id) {
    throw ApiError.forbidden('You can only pay your own fees');
  }
  if (req.user.role === 'parent') {
    await access.assertParentCanView(req.user.id, record.student_id, 'fees');
  }
  if (!['student', 'parent', 'admin'].includes(req.user.role)) {
    throw ApiError.forbidden('Only students, parents and administrators can record payments');
  }

  const outstanding = Number(record.total_amount) - Number(record.paid_amount);
  if (outstanding <= 0) throw ApiError.badRequest('This fee is already fully paid');
  if (amount > outstanding) {
    throw ApiError.badRequest(`The outstanding amount is ${outstanding.toFixed(2)}`);
  }

  const orderId = `order_${crypto.randomBytes(10).toString('hex')}`;

  const payment = await queryOne(
    `INSERT INTO payments (fee_record_id, student_id, amount, method, provider, provider_order_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'created') RETURNING *`,
    [feeRecordId, record.student_id, amount, method, providerName(), orderId]
  );

  return sendCreated(
    res,
    {
      payment,
      provider: providerName(),
      orderId,
      // The client needs the key id to open the Razorpay checkout; the secret
      // never leaves the server.
      razorpayKeyId: config.payments.enabled ? config.payments.razorpayKeyId : null,
      mockMode: !config.payments.enabled,
      message: config.payments.enabled
        ? 'Order created — complete the payment in the checkout window'
        : 'Mock payment mode: confirm this payment to settle it immediately',
    },
    'Payment initiated'
  );
});

/**
 * POST /api/payments/verify — settle a payment.
 *
 * In mock mode this simply succeeds. With Razorpay configured, the HMAC
 * signature is verified before a single rupee is credited.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { paymentId, providerPaymentId, providerSignature } = req.body;

  const result = await withTransaction(async (tx) => {
    const { rows } = await tx.query(
      'SELECT * FROM payments WHERE id = $1 FOR UPDATE',
      [paymentId]
    );
    const payment = rows[0];
    if (!payment) throw ApiError.notFound('Payment not found');
    if (payment.status === 'success') throw ApiError.badRequest('This payment has already been settled');

    if (config.payments.enabled) {
      if (!providerPaymentId || !providerSignature) {
        throw ApiError.badRequest('Payment verification details are missing');
      }
      const expected = crypto
        .createHmac('sha256', config.payments.razorpayKeySecret)
        .update(`${payment.provider_order_id}|${providerPaymentId}`)
        .digest('hex');

      // Constant-time compare so a signature cannot be brute-forced by timing.
      const provided = Buffer.from(providerSignature, 'utf8');
      const computed = Buffer.from(expected, 'utf8');
      const valid = provided.length === computed.length && crypto.timingSafeEqual(provided, computed);

      if (!valid) {
        await tx.query("UPDATE payments SET status = 'failed' WHERE id = $1", [paymentId]);
        throw ApiError.badRequest('Payment verification failed');
      }
    }

    const receiptNo = `RCPT-${Date.now().toString(36).toUpperCase()}`;

    await tx.query(
      `UPDATE payments
          SET status = 'success', provider_payment_id = $1, receipt_no = $2, paid_at = NOW()
        WHERE id = $3`,
      [providerPaymentId ?? `mock_${crypto.randomBytes(6).toString('hex')}`, receiptNo, paymentId]
    );

    // Credit the fee record and recompute its status from the new totals.
    const { rows: recordRows } = await tx.query(
      `UPDATE fee_records
          SET paid_amount = paid_amount + $1
        WHERE id = $2
        RETURNING *`,
      [payment.amount, payment.fee_record_id]
    );
    const record = recordRows[0];

    const status = deriveStatus(record.total_amount, record.paid_amount, record.due_date);
    await tx.query('UPDATE fee_records SET status = $1::fee_status WHERE id = $2', [
      status,
      record.id,
    ]);

    return { payment, record: { ...record, status }, receiptNo };
  });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PAYMENT_RECORDED,
    entity: 'payment',
    entityId: paymentId,
    metadata: { amount: result.payment.amount, receipt: result.receiptNo },
  });

  await notify({
    userId: result.payment.student_id,
    title: 'Payment received',
    message: `Payment of ₹${Number(result.payment.amount).toFixed(2)} received. Receipt ${result.receiptNo}.`,
    type: NOTIFICATION_TYPES.FEE,
    link: '/student/profile',
  });

  return sendSuccess(res, result, 'Payment successful');
});

export default {
  getStudentFees,
  listStructures,
  createStructure,
  getOverview,
  createPayment,
  verifyPayment,
};
