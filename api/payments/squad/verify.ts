import type { IncomingMessage, ServerResponse } from 'node:http';

const TX_REF_REGEX = /^[a-zA-Z0-9_\-]{4,128}$/;

interface ReqWithBody extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readJsonBody<T extends Record<string, unknown>>(req: ReqWithBody): Promise<T> {
  if (typeof req.body === 'object' && req.body !== null) {
    return req.body as T;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      return {} as T;
    }
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export default async function handler(req: ReqWithBody, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  const secretKey = (process.env.SQUAD_SECRET_KEY || '').trim();
  const envFlag = (process.env.SQUAD_ENV || '').trim().toLowerCase();
  const isLive =
    envFlag === 'live' ||
    envFlag === 'production' ||
    (secretKey.length > 0 &&
      !secretKey.startsWith('sandbox_') &&
      !secretKey.startsWith('test_'));
  const baseUrl = isLive ? 'https://api-d.squadco.com' : 'https://sandbox-api-d.squadco.com';

  if (!secretKey) {
    sendJson(res, 503, {
      error: 'SQUAD_NOT_CONFIGURED',
      message: 'Squad secret key is not configured on the server.',
    });
    return;
  }

  const body = await readJsonBody<{ transactionRef?: unknown }>(req);
  const transactionRef = typeof body.transactionRef === 'string' ? body.transactionRef.trim() : '';
  if (!TX_REF_REGEX.test(transactionRef)) {
    sendJson(res, 400, { message: 'Invalid Squad transaction reference.' });
    return;
  }

  try {
    const response = await fetch(
      `${baseUrl}/transaction/verify/${encodeURIComponent(transactionRef)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const rawText = await response.text();
    let payload: {
      status?: number;
      success?: boolean;
      message?: string;
      data?: {
        transaction_status?: string;
        transaction_amount?: number;
        transaction_currency_id?: string;
        transaction_ref?: string;
        email?: string;
      };
    } = {};
    try {
      payload = rawText ? (JSON.parse(rawText) as typeof payload) : {};
    } catch {
      payload = { message: rawText.slice(0, 200) };
    }

    if (!response.ok || !payload.data) {
      sendJson(res, response.status >= 400 ? response.status : 502, {
        verified: false,
        transactionRef,
        status: 'Failed',
        message: payload.message || 'Unable to verify Squad transaction.',
      });
      return;
    }

    const txStatus = (payload.data.transaction_status || '').trim();
    const currency = (payload.data.transaction_currency_id || 'NGN').trim().toUpperCase();
    const amountKobo = Number(payload.data.transaction_amount || 0);
    const amountNaira = Math.round(amountKobo / 100);
    const isSuccess =
      txStatus.toLowerCase() === 'success' && currency === 'NGN' && amountNaira >= 100;

    if (!isSuccess) {
      sendJson(res, 200, {
        verified: false,
        transactionRef: payload.data.transaction_ref || transactionRef,
        status: txStatus || 'Pending',
        amountNaira,
        currency,
        message: `Transaction status is "${txStatus || 'Pending'}".`,
      });
      return;
    }

    sendJson(res, 200, {
      verified: true,
      transactionRef: payload.data.transaction_ref || transactionRef,
      status: 'success',
      amountNaira,
      currency,
      email: payload.data.email || '',
    });
  } catch (error) {
    console.error('Squad verify error:', error);
    sendJson(res, 502, {
      verified: false,
      transactionRef,
      message: 'Network error while verifying Squad transaction.',
    });
  }
}
