import { config } from '../config/env.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

function authHeader() {
  const token = Buffer.from(`${config.payments.razorpayKeyId}:${config.payments.razorpayKeySecret}`).toString(
    'base64'
  );
  return `Basic ${token}`;
}

/**
 * Creates a real order against Razorpay's Orders API — the Checkout widget
 * on the client cannot open against an order id we made up ourselves, it has
 * to be one Razorpay actually knows about.
 *
 * `amount` is in rupees (matching the rest of this codebase); Razorpay's API
 * wants the smallest currency unit, i.e. paise.
 */
export async function createOrder({ amount, receipt, notes }) {
  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt,
      payment_capture: 1,
      notes,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.description || `Razorpay order creation failed (${response.status})`);
  }
  return data;
}

export default { createOrder };
