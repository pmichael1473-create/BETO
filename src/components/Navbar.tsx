import { useState } from 'react';
import { Trophy, Wallet, Volume2, VolumeX, Gamepad2, Users, Sun, Moon, LogIn, UserPlus, LogOut, ArrowUpRight, Pencil, Check, X } from 'lucide-react';
import { soundManager } from '../utils/audio';

interface NavbarProps {
  isAuthenticated: boolean;
  authReady: boolean;
  userName?: string;
  userAvatar?: string;
  balance: number;
  activeTab: 'lobby' | 'leaderboard' | 'auth';
  authPageMode?: 'signin' | 'signup';
  setActiveTab: (tab: 'lobby' | 'leaderboard' | 'auth') => void;
  onOpenWallet: () => void;
  onOpenWithdraw: () => void;
  onUpdateUserName?: (newName: string) => Promise<void>;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onSignOut: () => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function Navbar({
  isAuthenticated,
  authReady,
  userName,
  userAvatar,
  balance,
  activeTab,
  authPageMode,
  setActiveTab,
  onOpenWallet,
  onOpenWithdraw,
  onUpdateUserName,
  onOpenAuth,
  onSignOut,
  muted,
  setMuted,
  theme,
  onToggleTheme,
}: NavbarProps) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const startEditingName = () => {
    if (!userName || !onUpdateUserName) return;
    soundManager.playClick();
    setDraftName(userName);
    setEditingName(true);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateUserName || savingName) return;
    const trimmed = draftName.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2 || trimmed.length > 40) return;
    if (trimmed === userName) {
      setEditingName(false);
      return;
    }
    soundManager.playClick();
    setSavingName(true);
    try {
      await onUpdateUserName(trimmed);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };
  return (
    <header className="flex items-center justify-between gap-4 md:gap-8 px-4 md:px-6 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors">
      {/* Zone 1: Single text element wordmark */}
      <div 
        onClick={() => { soundManager.playClick(); setActiveTab(isAuthenticated ? 'lobby' : 'auth'); }}
        className="flex items-center gap-3 cursor-pointer group whitespace-nowrap shrink-0"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
          <Gamepad2 className="w-6 h-6 text-slate-950 font-bold" />
        </div>
        <div>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white block">Beto</span>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">High-Stakes Gaming</span>
        </div>
      </div>

      {/* Zone 2: Clean single-line text navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
        <button
          onClick={() => { soundManager.playClick(); setActiveTab('lobby'); }}
          className={`hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg ${
            activeTab === 'lobby' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : ''
          }`}
        >
          <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Game Lobbies</span>
        </button>
        <button
          onClick={() => { soundManager.playClick(); setActiveTab('leaderboard'); }}
          className={`hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg ${
            activeTab === 'leaderboard' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : ''
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span>Leaderboard</span>
        </button>
      </nav>

      {/* Zone 3: Theme, sound, auth / wallet */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            soundManager.playClick();
            onToggleTheme();
          }}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200 transition-colors"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            const next = !muted;
            soundManager.setMuted(next);
            setMuted(next);
            if (!next) soundManager.playClick();
          }}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300 transition-colors"
          title={muted ? 'Unmute Sound' : 'Mute Sound'}
          aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
        >
          {muted ? <VolumeX className="w-4 h-4 text-rose-500 dark:text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        </button>

        {!authReady ? (
          <div className="h-9 w-36 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        ) : isAuthenticated ? (
          <>
            {userName && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                {userAvatar && (
                  <img
                    src={userAvatar}
                    alt={userName}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                  />
                )}
                {editingName ? (
                  <form onSubmit={handleSaveName} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingName(false);
                        }
                      }}
                      minLength={2}
                      maxLength={40}
                      autoFocus
                      disabled={savingName}
                      aria-label="Username"
                      className="w-28 bg-white dark:bg-slate-900 border border-emerald-500 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={savingName || draftName.trim().length < 2}
                      title="Save username"
                      aria-label="Save username"
                      className="p-1 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 transition-colors"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={savingName}
                      onClick={() => setEditingName(false)}
                      title="Cancel"
                      aria-label="Cancel editing username"
                      className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={startEditingName}
                      title="Edit username"
                      className="flex items-center gap-1.5 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                      <span className="max-w-[120px] truncate">{userName}</span>
                      {onUpdateUserName && (
                        <Pencil className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => { soundManager.playCoin(); onOpenWallet(); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/20 transition-all hover:scale-105 whitespace-nowrap shrink-0 text-sm"
              title="Open Naira Wallet"
            >
              <Wallet className="w-4 h-4 text-emerald-100" />
              <span className="tabular-nums font-mono">₦{balance.toLocaleString()}</span>
            </button>

            <button
              type="button"
              onClick={() => { soundManager.playClick(); onOpenWithdraw(); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-300 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              title="Withdraw Naira"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span className="hidden sm:inline">Withdraw</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                onSignOut();
              }}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/50 dark:border-slate-700 dark:hover:border-rose-500/40 dark:text-slate-300 dark:hover:text-rose-400 transition-colors"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                onOpenAuth('signin');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'auth' && authPageMode === 'signin'
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-white'
              }`}
            >
              <LogIn className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                onOpenAuth('signup');
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 whitespace-nowrap ${
                activeTab === 'auth' && authPageMode === 'signup' ? 'ring-2 ring-emerald-400/60' : ''
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Sign Up</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
