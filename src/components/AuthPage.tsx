import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  LogIn,
  AlertCircle,
  ArrowRight,
  Gamepad2,
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, sanitizeDisplayName } from '../firebase';
import { soundManager } from '../utils/audio';

export type AuthMode = 'signin' | 'signup';

interface AuthPageProps {
  initialMode: AuthMode;
  reasonMessage?: string | null;
  onModeChange?: (mode: AuthMode) => void;
  onBeforeAuth?: (options: { mode: AuthMode; customHandle?: string; customAvatar?: string }) => void;
  onAuthSuccess: (options: { mode: AuthMode; customHandle?: string; customAvatar?: string }) => Promise<void>;
  onBrowseLobby: () => void;
}

const SHOWCASE_IMAGE = '/src/assets/images/betarena_auth_showcase_1795104781965.jpg';

const AVATAR_PRESETS = [
  {
    label: 'Emerald Ace',
    url: '/src/assets/images/avatar_emerald_ace_1795104784275.jpg',
  },
  {
    label: 'Gold Strategist',
    url: '/src/assets/images/avatar_gold_strategist_1795104783953.jpg',
  },
  {
    label: 'Cyan Duelist',
    url: '/src/assets/images/avatar_cyan_duelist_1795104784572.jpg',
  },
  {
    label: 'Crimson Queen',
    url: '/src/assets/images/avatar_crimson_queen_1795104783823.jpg',
  },
];

export function AuthPage({
  initialMode,
  reasonMessage,
  onModeChange,
  onBeforeAuth,
  onAuthSuccess,
  onBrowseLobby,
}: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [handle, setHandle] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showcaseFailed, setShowcaseFailed] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg(null);
  }, [initialMode]);

  const switchMode = (next: AuthMode) => {
    soundManager.playClick();
    setMode(next);
    setErrorMsg(null);
    onModeChange?.(next);
  };

  const handleGoogleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === 'signup' && handle.trim().length > 0 && handle.trim().length < 2) {
      setErrorMsg('Arena handle must be at least 2 characters.');
      return;
    }

    const customHandle = mode === 'signup' && handle.trim() ? sanitizeDisplayName(handle) : undefined;
    const customAvatar = mode === 'signup' && selectedAvatar ? selectedAvatar : undefined;

    setIsSubmitting(true);
    soundManager.playClick();
    onBeforeAuth?.({ mode, customHandle, customAvatar });

    try {
      await signInWithPopup(auth, googleProvider);
      await onAuthSuccess({
        mode,
        customHandle,
        customAvatar,
      });
    } catch (err: unknown) {
      onBeforeAuth?.({ mode });
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMsg('Sign-in popup was closed before completing. Please try again.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('Popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        setErrorMsg(
          `Domain "${host}" is not yet authorized in Firebase Authentication. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="max-w-6xl mx-auto px-4 py-8 lg:py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Column: Arena Showcase */}
        <div className="lg:col-span-6 flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="relative flex-1 min-h-64 sm:min-h-72 lg:min-h-80 w-full bg-emerald-950 overflow-hidden">
            {!showcaseFailed ? (
              <img
                src={SHOWCASE_IMAGE}
                alt="BetArena emerald felt tabletop with Whot cards, checkers, and gold challenge coins"
                referrerPolicy="no-referrer"
                onError={() => setShowcaseFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-900 via-slate-900 to-teal-950 flex items-center justify-center">
                <Gamepad2 className="w-16 h-16 text-emerald-400/60" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 text-white">
              <p className="text-xs font-medium text-emerald-300 mb-2">
                Whot · Checkers · Rock Paper Scissors · X and O · Memory Match
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-balance">
                Skill tables built for real-time stakes.
              </h1>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Create a player profile or sign back in to enter live rooms, challenge real players via invite links, and keep your Naira (₦) bankroll synced across every session.
            </p>
          </div>
        </div>

        {/* Right Column: Sign Up & Sign In Form */}
        <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 lg:p-10 shadow-sm flex flex-col justify-between">
          <form onSubmit={handleGoogleAuth} className="space-y-6">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`py-2.5 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                  mode === 'signup'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Sign Up</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`py-2.5 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                  mode === 'signin'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Sign In</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {mode === 'signup' ? 'Create your player account' : 'Sign in to BetArena'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {mode === 'signup'
                  ? 'Pick your arena handle and avatar to get started.'
                  : 'Continue with your Google account to restore your win streak and rooms.'}
              </p>
            </div>

            {reasonMessage && (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl text-amber-900 dark:text-amber-200 text-xs font-medium flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{reasonMessage}</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-rose-800 dark:text-rose-200 text-xs font-medium flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {mode === 'signup' ? (
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="arena-handle-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
                  >
                    Arena Handle <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    id="arena-handle-input"
                    type="text"
                    maxLength={40}
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="e.g. AceWhotKing (defaults to your Google name)"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                    Select Player Avatar <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playClick();
                        setSelectedAvatar('');
                      }}
                      className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                        selectedAvatar === ''
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-500/15 dark:border-emerald-500 dark:text-emerald-300'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      Google Photo
                    </button>

                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => {
                          soundManager.playClick();
                          setSelectedAvatar(preset.url);
                        }}
                        title={preset.label}
                        aria-label={`Select ${preset.label} avatar`}
                        className={`p-0.5 rounded-full border-2 transition-transform ${
                          selectedAvatar === preset.url
                            ? 'border-emerald-500 scale-105'
                            : 'border-slate-200 dark:border-slate-700 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-full object-cover bg-slate-200 dark:bg-slate-800"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Returning challenger?
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Signing in with Google loads your saved Naira (₦) balance, match win/loss record, and daily claim cooldown immediately.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-60 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2.5"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81"
                />
              </svg>
              <span>
                {isSubmitting
                  ? 'Connecting...'
                  : mode === 'signup'
                  ? 'Sign Up with Google'
                  : 'Sign In with Google'}
              </span>
            </button>

            <div className="flex items-center justify-between gap-4 text-xs pt-1">
              <button
                type="button"
                onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
                className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                {mode === 'signup'
                  ? 'Already registered? Sign in instead'
                  : 'Need an account? Sign up instead'}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Protected by Firebase Authentication</span>
            </div>
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                onBrowseLobby();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors whitespace-nowrap"
            >
              <span>Preview Game Lobbies</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
