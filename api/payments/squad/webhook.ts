import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface ReqWithBody extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readRawBody(req: ReqWithBody): Promise<string | Buffer> {
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'object' && req.body !== null) {
    return JSON.stringify(req.body);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: ReqWithBody, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  const secretKey = (process.env.SQUAD_SECRET_KEY || '').trim();
  const rawSignature = req.headers['x-squad-encrypted-body'];
  const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
  if (secretKey && signature) {
    const rawBody = await readRawBody(req);
    const expected = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex')
      .toUpperCase();
    if (signature.toUpperCase() !== expected) {
      sendJson(res, 401, { received: false, message: 'Invalid Squad webhook signature.' });
      return;
    }
  }

  sendJson(res, 200, { received: true });
}
