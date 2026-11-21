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

export async function fetchSquadConfig(): Promise<SquadClientConfig> {
  const res = await fetch('/api/payments/squad/config');
  if (!res.ok) {
    throw new Error('Could not check Squad gateway configuration.');
  }
  return (await res.json()) as SquadClientConfig;
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
  const data = (await res.json()) as SquadInitiateResponse & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || 'Failed to initiate Squad checkout.');
  }
  return data;
}

export async function verifySquadPayment(transactionRef: string): Promise<SquadVerifyResponse> {
  const res = await fetch('/api/payments/squad/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionRef }),
  });
  const data = (await res.json()) as SquadVerifyResponse & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || 'Failed to verify Squad transaction.');
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
