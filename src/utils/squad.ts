export interface SquadClientConfig {
  configured: boolean;
  hasPublicKey: boolean;
  publicKey: string | null;
  mode: 'live' | 'sandbox';
}

export interface SquadInitiateResponse {
  transactionRef: string;
  amountNaira: number;
  amountKobo: number;
  currency: 'NGN';
  email: string;
  publicKey: string | null;
  checkoutUrl: string | null;
  callbackUrl: string;
  mode: 'live' | 'sandbox';
  checkoutMode?: 'inline' | 'hosted';
}

export interface SquadVerifyResponse {
  verified: boolean;
  transactionRef: string;
  status: string;
  amountNaira?: number;
  currency?: string;
  email?: string;
  message?: string;
}

interface SquadWidgetInstance {
  setup: () => void;
  open: () => void;
}

type SquadWidgetConstructor = new (config: {
  onClose?: () => void;
  onLoad?: () => void;
  onSuccess?: (response: unknown) => void;
  key: string;
  email: string;
  amount: number;
  currency_code: string;
  transaction_ref?: string;
  customer_name?: string;
  callback_url?: string;
  pass_charge?: boolean;
  payment_channels?: string[];
}) => SquadWidgetInstance;

declare global {
  interface Window {
    squad?: SquadWidgetConstructor;
    Squad?: SquadWidgetConstructor;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadSquadWidgetScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Squad widget requires a browser environment.'));
  }
  if (window.squad || window.Squad) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.squadco.com/widget/squad.min.js"]'
    );
    if (existing) {
      if (existing.dataset.squadFailed === 'true') {
        existing.remove();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => {
            existing.dataset.squadFailed = 'true';
            scriptPromise = null;
            reject(new Error('Failed to load Squad checkout widget script.'));
          },
          { once: true }
        );
        return;
      }
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.squadco.com/widget/squad.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.dataset.squadFailed = 'true';
      scriptPromise = null;
      reject(new Error('Failed to load Squad checkout widget script.'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

function tryParseJson<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function fetchSquadConfig(): Promise<SquadClientConfig> {
  const res = await fetch('/api/payments/squad/config');
  if (!res.ok) {
    const errorText = await res.text();
    console.warn('Squad config error:', res.status, errorText);
    return {
      configured: false,
      hasPublicKey: false,
      publicKey: null,
      mode: 'sandbox',
    };
  }
  const raw = await res.text();
  const data = tryParseJson<SquadClientConfig>(raw);
  if (!data || typeof data.configured !== 'boolean') {
    return {
      configured: false,
      hasPublicKey: false,
      publicKey: null,
      mode: 'sandbox',
    };
  }
  return data;
}

export async function initiateSquadPayment(params: {
  amountNaira: number;
  email: string;
  uid: string;
  playerName: string;
  checkoutMode?: 'inline' | 'hosted';
}): Promise<SquadInitiateResponse> {
  const res = await fetch('/api/payments/squad/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Server error:', res.status, errorText);
    const parsedError = tryParseJson<{ message?: string }>(errorText);
    if (parsedError?.message) {
      throw new Error(parsedError.message);
    }
    throw new Error(
      res.status === 404
        ? 'Squad payment API route was not found (404). Redeploy with /api routes and configure SQUAD_SECRET_KEY.'
        : `Request failed: ${res.status}`
    );
  }

  const raw = await res.text();
  const data = tryParseJson<SquadInitiateResponse>(raw);
  if (!data) {
    throw new Error('Server returned an unexpected non-JSON response while starting Squad checkout.');
  }
  return data;
}

export async function verifySquadPayment(transactionRef: string): Promise<SquadVerifyResponse> {
  const res = await fetch('/api/payments/squad/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionRef }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Server error:', res.status, errorText);
    const parsedError = tryParseJson<{ message?: string }>(errorText);
    if (parsedError?.message) {
      throw new Error(parsedError.message);
    }
    throw new Error(
      res.status === 404
        ? 'Squad verification API route was not found (404). Redeploy with /api routes.'
        : `Request failed: ${res.status}`
    );
  }

  const raw = await res.text();
  const data = tryParseJson<SquadVerifyResponse>(raw);
  if (!data) {
    throw new Error('Server returned an unexpected non-JSON response while verifying Squad payment.');
  }
  return data;
}

export async function openSquadInlineCheckout(options: {
  publicKey: string;
  email: string;
  amountKobo: number;
  transactionRef: string;
  customerName?: string;
  callbackUrl?: string;
  onSuccess: (resolvedRef: string) => void;
  onClose?: () => void;
  onLoad?: () => void;
}): Promise<void> {
  await loadSquadWidgetScript();
  const Ctor = window.squad || window.Squad;
  if (!Ctor) {
    throw new Error('Squad widget did not initialize.');
  }
  const instance = new Ctor({
    key: options.publicKey,
    email: options.email,
    amount: options.amountKobo,
    currency_code: 'NGN',
    transaction_ref: options.transactionRef,
    customer_name: options.customerName,
    callback_url: options.callbackUrl,
    pass_charge: false,
    payment_channels: ['card', 'bank', 'ussd', 'transfer'],
    onLoad: options.onLoad,
    onClose: options.onClose,
    onSuccess: (response: unknown) => {
      const resObj =
        typeof response === 'object' && response !== null
          ? (response as { transaction_ref?: string; reference?: string })
          : undefined;
      options.onSuccess(resObj?.transaction_ref || resObj?.reference || options.transactionRef);
    },
  });
  instance.setup();
  instance.open();
}
