import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TX_REF_REGEX = /^[a-zA-Z0-9_\-]{4,128}$/;

interface SquadConfig {
  secretKey: string;
  publicKey: string;
  mode: 'live' | 'sandbox';
  baseUrl: string;
}

function getSquadConfig(): SquadConfig {
  const secretKey = (process.env.SQUAD_SECRET_KEY || '').trim();
  const publicKey = (process.env.SQUAD_PUBLIC_KEY || process.env.VITE_SQUAD_PUBLIC_KEY || '').trim();
  const envFlag = (process.env.SQUAD_ENV || '').trim().toLowerCase();

  const isLive =
    envFlag === 'live' ||
    envFlag === 'production' ||
    (secretKey.length > 0 &&
      !secretKey.startsWith('sandbox_') &&
      !secretKey.startsWith('test_'));

  return {
    secretKey,
    publicKey,
    mode: isLive ? 'live' : 'sandbox',
    baseUrl: isLive ? 'https://api-d.squadco.com' : 'https://sandbox-api-d.squadco.com',
  };
}

function resolveAppBaseUrl(req: Request): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl)) {
    return envUrl;
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${Array.isArray(host) ? host[0] : host}`;
}

async function startServer() {
  const app = express();

  // Squad webhook must inspect raw body for HMAC-SHA512 verification
  app.post(
    '/api/payments/squad/webhook',
    express.raw({ type: 'application/json' }),
    (req: Request, res: Response) => {
      const cfg = getSquadConfig();
      const signature = req.header('x-squad-encrypted-body');
      if (cfg.secretKey && signature) {
        const expected = crypto
          .createHmac('sha512', cfg.secretKey)
          .update(req.body instanceof Buffer ? req.body : Buffer.from(String(req.body || '')))
          .digest('hex')
          .toUpperCase();
        if (signature.toUpperCase() !== expected) {
          res.status(401).json({ received: false, message: 'Invalid Squad webhook signature.' });
          return;
        }
      }
      res.status(200).json({ received: true });
    }
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/payments/squad/config', (_req: Request, res: Response) => {
    const cfg = getSquadConfig();
    res.json({
      configured: cfg.secretKey.length > 0,
      hasPublicKey: cfg.publicKey.length > 0,
      publicKey: cfg.publicKey || null,
      mode: cfg.mode,
    });
  });

  app.post('/api/payments/squad/initiate', async (req: Request, res: Response) => {
    const cfg = getSquadConfig();
    if (!cfg.secretKey) {
      res.status(503).json({
        error: 'SQUAD_NOT_CONFIGURED',
        message: 'Squad secret key is not configured on the server yet.',
      });
      return;
    }

    const body = (req.body || {}) as {
      amountNaira?: unknown;
      email?: unknown;
      uid?: unknown;
      playerName?: unknown;
      checkoutMode?: unknown;
    };

    const amountNaira = typeof body.amountNaira === 'number' ? Math.round(body.amountNaira) : NaN;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    const playerName = typeof body.playerName === 'string' ? body.playerName.trim().slice(0, 60) : 'BetArena Player';
    const requestedMode = body.checkoutMode === 'hosted' ? 'hosted' : 'inline';

    if (!Number.isFinite(amountNaira) || amountNaira < 100 || amountNaira > 500000) {
      res.status(400).json({ message: 'Deposit amount must be between ₦100 and ₦500,000.' });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ message: 'A valid player email address is required by Squad.' });
      return;
    }
    if (!uid || !TX_REF_REGEX.test(uid)) {
      res.status(400).json({ message: 'Invalid authenticated player ID.' });
      return;
    }

    const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase();
    const transactionRef = `BA_${Date.now()}_${randomPart}`;
    const amountKobo = amountNaira * 100;
    const callbackUrl = `${resolveAppBaseUrl(req)}/?squad_tx=${encodeURIComponent(transactionRef)}`;

    // When using Squad's inline modal (squad.min.js) with a public key, the widget
    // calls Squad's /transaction/initiate itself. Pre-calling /transaction/initiate
    // on the server with the same transaction_ref causes "[Duplicate reference]".
    if (cfg.publicKey && requestedMode === 'inline') {
      res.json({
        transactionRef,
        amountNaira,
        amountKobo,
        currency: 'NGN',
        email,
        publicKey: cfg.publicKey,
        checkoutUrl: null,
        callbackUrl,
        mode: cfg.mode,
        checkoutMode: 'inline',
      });
      return;
    }

    try {
      const response = await fetch(`${cfg.baseUrl}/transaction/initiate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.secretKey}`,
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

      const payload = (await response.json()) as {
        status?: number;
        success?: boolean;
        message?: string;
        data?: {
          checkout_url?: string;
          transaction_ref?: string;
        };
      };

      if (!response.ok || payload.success === false) {
        res.status(response.status >= 400 ? response.status : 502).json({
          message: payload.message || 'Squad transaction initiation failed.',
        });
        return;
      }

      res.json({
        transactionRef: payload.data?.transaction_ref || transactionRef,
        amountNaira,
        amountKobo,
        currency: 'NGN',
        email,
        publicKey: null,
        checkoutUrl: payload.data?.checkout_url || null,
        callbackUrl,
        mode: cfg.mode,
        checkoutMode: 'hosted',
      });
    } catch (error) {
      console.error('Squad initiate error:', error);
      res.status(502).json({
        message: 'Could not reach Squad payment servers. Please try again shortly.',
      });
    }
  });

  app.post('/api/payments/squad/verify', async (req: Request, res: Response) => {
    const cfg = getSquadConfig();
    if (!cfg.secretKey) {
      res.status(503).json({
        error: 'SQUAD_NOT_CONFIGURED',
        message: 'Squad secret key is not configured on the server.',
      });
      return;
    }

    const body = (req.body || {}) as { transactionRef?: unknown };
    const transactionRef = typeof body.transactionRef === 'string' ? body.transactionRef.trim() : '';
    if (!TX_REF_REGEX.test(transactionRef)) {
      res.status(400).json({ message: 'Invalid Squad transaction reference.' });
      return;
    }

    try {
      const response = await fetch(
        `${cfg.baseUrl}/transaction/verify/${encodeURIComponent(transactionRef)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${cfg.secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const payload = (await response.json()) as {
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
      };

      if (!response.ok || !payload.data) {
        res.status(response.status >= 400 ? response.status : 502).json({
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
      const isSuccess = txStatus.toLowerCase() === 'success' && currency === 'NGN' && amountNaira >= 100;

      if (!isSuccess) {
        res.json({
          verified: false,
          transactionRef: payload.data.transaction_ref || transactionRef,
          status: txStatus || 'Pending',
          amountNaira,
          currency,
          message: `Transaction status is "${txStatus || 'Pending'}".`,
        });
        return;
      }

      res.json({
        verified: true,
        transactionRef: payload.data.transaction_ref || transactionRef,
        status: 'success',
        amountNaira,
        currency,
        email: payload.data.email || '',
      });
    } catch (error) {
      console.error('Squad verify error:', error);
      res.status(502).json({
        verified: false,
        transactionRef,
        message: 'Network error while verifying Squad transaction.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BetArena server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
