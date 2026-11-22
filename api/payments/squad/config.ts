import type { IncomingMessage, ServerResponse } from 'node:http';

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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

  sendJson(res, 200, {
    configured: secretKey.length > 0,
    hasPublicKey: publicKey.length > 0,
    publicKey: publicKey || null,
    mode: isLive ? 'live' : 'sandbox',
  });
}
