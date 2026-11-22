import crypto from 'node:crypto';
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

function resolveAppBaseUrl(req: IncomingMessage): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl)) {
    return envUrl;
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto}://${host}`;
}

export default async function handler(req: ReqWithBody, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  const secretKey = (process.env.SQUAD_SECRET_KEY || '').trim();
  const publicKey = (
    process.env.SQUAD_PUBLIC_KEY ||
    process.env.VITE_SQUAD_PUBLIC_KEY ||
    ''
  ).trim();
  const envFlag = (process.env.SQUAD_ENV || '').trim().toLowerCase();
  const isLive =
    envFlag === 'live' ||
    envFlag === 'production' ||
    (secretKey.length > 0 &&
      !secretKey.startsWith('sandbox_') &&
      !secretKey.startsWith('test_'));
  const mode: 'live' | 'sandbox' = isLive ? 'live' : 'sandbox';
  const baseUrl = isLive ? 'https://api-d.squadco.com' : 'https://sandbox-api-d.squadco.com';

  if (!secretKey) {
    sendJson(res, 503, {
      error: 'SQUAD_NOT_CONFIGURED',
      message: 'Squad secret key is not configured on the server yet.',
    });
    return;
  }

  const body = await readJsonBody<{
    amountNaira?: unknown;
    email?: unknown;
    uid?: unknown;
    playerName?: unknown;
    checkoutMode?: unknown;
  }>(req);

  const amountNaira = typeof body.amountNaira === 'number' ? Math.round(body.amountNaira) : NaN;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
  const playerName =
    typeof body.playerName === 'string' ? body.playerName.trim().slice(0, 60) : 'BetArena Player';
  const requestedMode = body.checkoutMode === 'hosted' ? 'hosted' : 'inline';

  if (!Number.isFinite(amountNaira) || amountNaira < 100 || amountNaira > 500000) {
    sendJson(res, 400, { message: 'Deposit amount must be between ₦100 and ₦500,000.' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    sendJson(res, 400, { message: 'A valid player email address is required by Squad.' });
    return;
  }
  if (!uid || !TX_REF_REGEX.test(uid)) {
    sendJson(res, 400, { message: 'Invalid authenticated player ID.' });
    return;
  }

  const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase();
  const transactionRef = `BA_${Date.now()}_${randomPart}`;
  const amountKobo = amountNaira * 100;
  const callbackUrl = `${resolveAppBaseUrl(req)}/?squad_tx=${encodeURIComponent(transactionRef)}`;

  if (publicKey && requestedMode === 'inline') {
    sendJson(res, 200, {
      transactionRef,
      amountNaira,
      amountKobo,
      currency: 'NGN',
      email,
      publicKey,
      checkoutUrl: null,
      callbackUrl,
      mode,
      checkoutMode: 'inline',
    });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/transaction/initiate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        currency: 'NGN',
        initiate_type: 'inline',
        transaction_ref: transactionRef,
        callback_url: callbackUrl,
        payment_channels: ['card', 'bank', 'ussd', 'transfer'],
        customer_name: playerName,
        metadata: {
          uid,
          amountNaira,
          platform: 'BetArena',
        },
      }),
    });

    const rawText = await response.text();
    let payload: {
      status?: number;
      success?: boolean;
      message?: string;
      data?: {
        checkout_url?: string;
        transaction_ref?: string;
      };
    } = {};
    try {
      payload = rawText ? (JSON.parse(rawText) as typeof payload) : {};
    } catch {
      payload = { message: rawText.slice(0, 200) };
    }

    if (!response.ok || payload.success === false) {
      sendJson(res, response.status >= 400 ? response.status : 502, {
        message: payload.message || 'Squad transaction initiation failed.',
      });
      return;
    }

    sendJson(res, 200, {
      transactionRef: payload.data?.transaction_ref || transactionRef,
      amountNaira,
      amountKobo,
      currency: 'NGN',
      email,
      publicKey: null,
      checkoutUrl: payload.data?.checkout_url || null,
      callbackUrl,
      mode,
      checkoutMode: 'hosted',
    });
  } catch (error) {
    console.error('Squad initiate error:', error);
    sendJson(res, 502, {
      message: 'Could not reach Squad payment servers. Please try again shortly.',
    });
  }
}
