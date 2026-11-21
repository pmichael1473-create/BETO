import { useState, useEffect } from 'react';
import {
  X,
  Wallet,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
  ArrowUpRight,
  ArrowDownLeft,
  Landmark,
  User,
  Clock,
} from 'lucide-react';
import { soundManager } from '../utils/audio';
import {
  NAIRA_STAKES,
  WITHDRAWAL_AMOUNTS,
  WithdrawalAmount,
  creditSquadDeposit,
  withdrawWalletFunds,
} from '../firebase';

const SQUAD_1600_LINK = 'https://pay.squadco.com/1DPNTE';
const NIGERIAN_BANKS = [
  'Access Bank',
  'Fidelity Bank',
  'First Bank',
  'GTBank',
  'Kuda Bank',
  'Moniepoint MFB',
  'OPay',
  'PalmPay',
  'Sterling Bank',
  'UBA',
  'Union Bank',
  'Wema Bank',
  'Zenith Bank',
] as const;

import { WalletTransaction } from '../types';
import {
  fetchSquadConfig,
  initiateSquadPayment,
  openSquadInlineCheckout,
  verifySquadPayment,
  SquadClientConfig,
} from '../utils/squad';

interface WalletModalProps {
  isOpen: boolean;
  initialTab?: 'deposit' | 'withdraw';
  onClose: () => void;
  uid: string;
  playerEmail: string;
  playerName: string;
  balance: number;
  transactions: WalletTransaction[];
  onSquadCredited: (newBalance: number, txRef: string, amountNaira: number) => void;
  onWithdrawn: (newBalance: number, txRef: string, amountNaira: number) => void;
}

export function WalletModal({
  isOpen,
  initialTab = 'deposit',
  onClose,
  uid,
  playerEmail,
  playerName,
  balance,
  transactions,
  onSquadCredited,
  onWithdrawn,
}: WalletModalProps) {
  const [walletTab, setWalletTab] = useState<'deposit' | 'withdraw'>(initialTab);
  const [depositAmount, setDepositAmount] = useState<string>('3400');
  const [withdrawAmount, setWithdrawAmount] = useState<WithdrawalAmount>(1700);
  const [bankName, setBankName] = useState<string>('GTBank');
  const [accountName, setAccountName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [showEmbeddedPayLink, setShowEmbeddedPayLink] = useState(false);
  const [manualTxRef, setManualTxRef] = useState('');
  const [squadConfig, setSquadConfig] = useState<SquadClientConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [verifyingRef, setVerifyingRef] = useState<string | null>(null);
  const [pendingTxRef, setPendingTxRef] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setWalletTab(initialTab);
    setSuccessMsg(null);
    setErrorMsg(null);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoadingConfig(true);
    setErrorMsg(null);
    fetchSquadConfig()
      .then((cfg) => {
        if (active) setSquadConfig(cfg);
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to check Squad gateway status.');
        }
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const verifyAndCredit = async (txRef: string, fallbackAmount: number) => {
    setVerifyingRef(txRef);
    setErrorMsg(null);
    try {
      const verification = await verifySquadPayment(txRef);
      if (!verification.verified) {
        setErrorMsg(
          verification.message ||
            `Payment status for ${txRef} is "${verification.status}". Complete payment or verify again.`
        );
        return;
      }

      const amountNaira = verification.amountNaira || fallbackAmount;
      const credited = await creditSquadDeposit({
        uid,
        transactionRef: verification.transactionRef || txRef,
        amountNaira,
      });

      soundManager.playCoin();
      setPendingTxRef(null);
      onSquadCredited(credited.newBalance, verification.transactionRef || txRef, amountNaira);
      setSuccessMsg(
        credited.alreadyCredited
          ? `Transaction ${txRef} was already credited to your wallet.`
          : `Squad payment verified! +₦${amountNaira.toLocaleString()} added to your wallet.`
      );
      window.setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to verify Squad transaction.');
    } finally {
      setVerifyingRef(null);
    }
  };

  const handleSquadDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (processing || verifyingRef) return;

    const amt = parseInt(depositAmount, 10);
    if (amt === 1600 && squadConfig && !squadConfig.configured) {
      soundManager.playClick();
      setErrorMsg(null);
      setShowEmbeddedPayLink(true);
      return;
    }

    if (isNaN(amt) || amt < 100 || amt > 500000) {
      setErrorMsg('Please enter an amount between ₦100 and ₦500,000.');
      return;
    }
    if (!playerEmail) {
      setErrorMsg('Your signed-in Google account email is required to process Squad payments.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setProcessing(true);
    soundManager.playClick();

    try {
      const initiated = await initiateSquadPayment({
        amountNaira: amt,
        email: playerEmail,
        uid,
        playerName,
      });

      setPendingTxRef(initiated.transactionRef);

      if (initiated.publicKey && initiated.checkoutMode !== 'hosted') {
        try {
          await openSquadInlineCheckout({
            publicKey: initiated.publicKey,
            email: initiated.email,
            amountKobo: initiated.amountKobo,
            transactionRef: initiated.transactionRef,
            customerName: playerName,
            callbackUrl: initiated.callbackUrl,
            onClose: () => {
              setProcessing(false);
            },
            onSuccess: (resolvedRef) => {
              setPendingTxRef(resolvedRef);
              void verifyAndCredit(resolvedRef, amt);
            },
          });
          setProcessing(false);
          return;
        } catch {
          // Inline script blocked or unavailable — initiate a fresh hosted checkout session
          const hosted = await initiateSquadPayment({
            amountNaira: amt,
            email: playerEmail,
            uid,
            playerName,
            checkoutMode: 'hosted',
          });
          setPendingTxRef(hosted.transactionRef);
          if (hosted.checkoutUrl) {
            window.location.assign(hosted.checkoutUrl);
            return;
          }
          throw new Error('Squad did not return a hosted checkout URL.');
        }
      }

      if (initiated.checkoutUrl) {
        window.location.assign(initiated.checkoutUrl);
        return;
      }

      throw new Error('Squad did not return a checkout URL or public key for inline checkout.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not start Squad payment.');
      setProcessing(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawing || processing || verifyingRef) return;

    if (!WITHDRAWAL_AMOUNTS.includes(withdrawAmount)) {
      setErrorMsg('Please choose one of the supported withdrawal amounts.');
      return;
    }

    if (balance < withdrawAmount) {
      setErrorMsg(
        `Insufficient balance. You need ₦${withdrawAmount.toLocaleString()} to withdraw this amount.`
      );
      return;
    }

    const cleanAccountName = accountName.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (cleanAccountName.length < 2) {
      setErrorMsg('Please enter your bank account name (at least 2 characters).');
      return;
    }

    const cleanDigits = accountNumber.replace(/\D/g, '');
    if (cleanDigits.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit bank account number.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setWithdrawing(true);
    soundManager.playClick();

    try {
      const result = await withdrawWalletFunds({
        uid,
        amountNaira: withdrawAmount,
        bankName,
        accountName: cleanAccountName,
        accountNumber: cleanDigits,
      });

      soundManager.playCoin();
      setAccountName('');
      setAccountNumber('');
      onWithdrawn(result.newBalance, result.transactionRef, result.amountNaira);
      setSuccessMsg(
        `Withdrawal of ₦${result.amountNaira.toLocaleString()} for ${result.accountName} (${bankName} ${result.maskedAccount}) submitted — Pending approval.`
      );
      window.setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process withdrawal.');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full ${
          showEmbeddedPayLink ? 'max-w-xl' : 'max-w-md'
        } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col transition-all`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Naira Wallet</h3>
                {squadConfig && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                      squadConfig.configured
                        ? squadConfig.mode === 'live'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                    }`}
                  >
                    {squadConfig.configured ? `Squad ${squadConfig.mode}` : 'Setup Needed'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Powered by Squad (HabariPay / GTCO)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              onClose();
            }}
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close wallet modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Balance card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-500/20 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Wallet className="w-24 h-24 text-emerald-500 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Current Balance
            </p>
            <p className="text-3xl font-extrabold mt-1 tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
              ₦{balance.toLocaleString()}{' '}
              <span className="text-sm font-normal text-slate-600 dark:text-slate-300">NGN</span>
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Secured by Beto Escrow & Squad Verify</span>
            </div>
          </div>

          {/* Deposit / Withdraw Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                setErrorMsg(null);
                setWalletTab('deposit');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                walletTab === 'deposit'
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                setErrorMsg(null);
                setShowEmbeddedPayLink(false);
                setWalletTab('withdraw');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                walletTab === 'withdraw'
                  ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Withdraw</span>
            </button>
          </div>

          {walletTab === 'deposit' ? (
            <>
              {!loadingConfig && squadConfig && !squadConfig.configured && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
                  <p className="font-bold">Squad Gateway Not Configured</p>
                  <p className="leading-relaxed">
                    Add <code className="font-mono font-semibold">SQUAD_SECRET_KEY</code> and{' '}
                    <code className="font-mono font-semibold">SQUAD_PUBLIC_KEY</code> from your Squad
                    Dashboard (<code className="font-mono">dashboard.squadco.com</code>) in Environment
                    Secrets to accept live or sandbox Naira payments.
                  </p>
                </div>
              )}

              {/* Squad Naira Top-Up */}
              <form onSubmit={handleSquadDeposit} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Fund Wallet via Squad (Card · Bank Transfer · USSD)
                </label>
            <div className="grid grid-cols-5 gap-1.5">
              {NAIRA_STAKES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setErrorMsg(null);
                    setDepositAmount(String(preset));
                    if (preset === 1600 && squadConfig && !squadConfig.configured) {
                      setShowEmbeddedPayLink((prev) =>
                        depositAmount === '1600' ? !prev : true
                      );
                    } else {
                      setShowEmbeddedPayLink(false);
                    }
                  }}
                  className={`py-1.5 rounded-lg text-[11px] font-mono font-bold border transition-colors tabular-nums ${
                    depositAmount === String(preset)
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-400 dark:text-emerald-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  ₦{preset.toLocaleString()}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-2 text-slate-500 dark:text-slate-400 text-sm font-mono font-bold">
                  ₦
                </span>
                <input
                  type="number"
                  min="100"
                  max="500000"
                  step="100"
                  value={depositAmount}
                  onChange={(e) => {
                    setDepositAmount(e.target.value);
                    if (e.target.value !== '1600') {
                      setShowEmbeddedPayLink(false);
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-4 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 font-mono tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={processing || Boolean(verifyingRef)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-60 text-slate-950 font-bold text-sm shadow-md shadow-emerald-500/20 transition-all inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <span>Pay with Squad</span>
                )}
              </button>
            </div>

            {showEmbeddedPayLink && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-slate-50 dark:bg-slate-950 overflow-hidden shadow-inner">
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      Squad Embedded Checkout · ₦1,600
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {SQUAD_1600_LINK}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={SQUAD_1600_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>Open Tab</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowEmbeddedPayLink(false)}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      Hide
                    </button>
                  </div>
                </div>

                <iframe
                  src={SQUAD_1600_LINK}
                  title="SquadCo ₦1,600 Payment Checkout"
                  allow="payment *"
                  className="w-full h-[460px] bg-white border-0"
                />

                <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  {squadConfig?.configured ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualTxRef}
                        onChange={(e) => setManualTxRef(e.target.value)}
                        placeholder="Paste Squad Transaction Ref to verify & credit"
                        className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={!manualTxRef.trim() || Boolean(verifyingRef)}
                        onClick={() => void verifyAndCredit(manualTxRef.trim(), 1600)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap"
                      >
                        {verifyingRef === manualTxRef.trim() ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>Verify Ref</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      If your browser blocks third-party checkout framing, use <strong>Open Tab</strong> above.
                    </p>
                  )}
                </div>
              </div>
            )}

            {pendingTxRef && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                    Ref: {pendingTxRef}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Already completed transfer or USSD? Verify now.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(verifyingRef)}
                  onClick={() => void verifyAndCredit(pendingTxRef, parseInt(depositAmount, 10) || 100)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap"
                >
                  {verifyingRef === pendingTxRef ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Verify</span>
                </button>
              </div>
            )}

                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Every deposit is verified server-side via Squad before crediting your ₦ balance.
                  </span>
                </div>
              </form>
            </>
          ) : (
            /* Naira Withdrawal Form */
            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Select Withdrawal Amount
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Available: ₦{balance.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {WITHDRAWAL_AMOUNTS.map((preset) => {
                    const affordable = balance >= preset;
                    const selected = withdrawAmount === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          soundManager.playClick();
                          setErrorMsg(null);
                          setWithdrawAmount(preset);
                        }}
                        className={`py-2 rounded-lg text-[11px] font-mono font-bold border transition-colors tabular-nums ${
                          selected
                            ? 'bg-amber-50 border-amber-500 text-amber-800 dark:bg-amber-500/20 dark:border-amber-400 dark:text-amber-300'
                            : affordable
                            ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800'
                            : 'bg-slate-50/60 border-slate-200/70 text-slate-400 dark:bg-slate-950/50 dark:border-slate-800/70 dark:text-slate-600'
                        }`}
                      >
                        ₦{preset.toLocaleString()}
                      </button>
                    );
                  })}
                </div>
                {balance < withdrawAmount && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    Insufficient balance for ₦{withdrawAmount.toLocaleString()} (need ₦
                    {(withdrawAmount - balance).toLocaleString()} more).
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="withdraw-account-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Account Name (Full Name)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    id="withdraw-account-name"
                    type="text"
                    maxLength={80}
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Enter bank account holder name"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="withdraw-bank"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Destination Bank
                  </label>
                  <div className="relative">
                    <Landmark className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <select
                      id="withdraw-bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500"
                    >
                      {NIGERIAN_BANKS.map((bank) => (
                        <option key={bank} value={bank}>
                          {bank}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="withdraw-account"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Account Number (10 digits)
                  </label>
                  <input
                    id="withdraw-account"
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="0123456789"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-xs sm:text-sm font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={withdrawing || balance < withdrawAmount}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
              >
                {withdrawing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Withdrawal...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Withdraw ₦{withdrawAmount.toLocaleString()}</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>
                  Withdrawals are processed in preset NGN tiers (₦1,700 · ₦3,500 · ₦5,300 · ₦8,000 · ₦10,700).
                </span>
              </div>
            </form>
          )}

          {/* Recent Wallet Activity */}
          {transactions.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Recent Wallet Activity
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {transactions.slice(0, 5).map((tx) => {
                  const isWithdrawal = tx.type === 'withdrawal' || tx.provider === 'beto_payout';
                  const isApproved = tx.status === 'approved' || tx.status === 'success';
                  return (
                    <div
                      key={tx.id}
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isApproved ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-slate-700 dark:text-slate-200 truncate">
                            {isWithdrawal && tx.bankName
                              ? `${tx.accountName ? `${tx.accountName} · ` : ''}${tx.bankName} ${
                                  tx.accountNumber
                                    ? tx.accountNumber.length === 10
                                      ? `****${tx.accountNumber.slice(-4)}`
                                      : tx.accountNumber
                                    : ''
                                }`
                              : tx.id}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {isWithdrawal ? 'Withdrawal · ' : 'Squad Deposit · '}
                            {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                            isApproved
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                          }`}
                        >
                          {isApproved ? 'Approved' : 'Pending'}
                        </span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            isWithdrawal
                              ? isApproved
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isWithdrawal ? '-' : '+'}₦{tx.amountNaira.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
