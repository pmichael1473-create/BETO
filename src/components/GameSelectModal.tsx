import { useState } from 'react';
import { X, Gamepad2, Coins, Globe, Lock, Link2, Users } from 'lucide-react';
import { GameType, RoomVisibility } from '../types';
import { soundManager } from '../utils/audio';

interface GameSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRoom: (
    title: string,
    gameType: GameType,
    stake: number,
    maxPlayers: number,
    visibility: RoomVisibility,
    invitedHandles: string[]
  ) => Promise<void> | void;
}

import { NAIRA_STAKES, parseInvitedHandles } from '../firebase';

export function GameSelectModal({ isOpen, onClose, onCreateRoom }: GameSelectModalProps) {
  const [gameType, setGameType] = useState<GameType>('whot');
  const [title, setTitle] = useState<string>('Whot! 2-Player Table');
  const [stake, setStake] = useState<number>(1600);
  const [maxPlayers, setMaxPlayers] = useState<number>(2);
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [invitedInput, setInvitedInput] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    soundManager.playClick();
    setSubmitting(true);
    try {
      const invitedHandles = visibility === 'private' ? parseInvitedHandles(invitedInput) : [];
      await onCreateRoom(
        title || 'Arena Match',
        gameType,
        stake,
        maxPlayers,
        visibility,
        invitedHandles
      );
      setInvitedInput('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Real-Player Room</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Minimum 2 real players required · Share invite link to fill seats
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close room modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Game Type Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Select Game</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {[
                { type: 'whot', name: 'Whot!', icon: '🃏' },
                { type: 'checkers', name: 'Checkers', icon: '🔴' },
                { type: 'rps', name: 'Rock Paper Scissors', icon: '✂️' },
                { type: 'tictactoe', name: 'X and O', icon: '❌' },
                { type: 'memory', name: 'Memory Match', icon: '🧠' },
              ].map((g) => (
                <button
                  key={g.type}
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setGameType(g.type as GameType);
                    setTitle(`${g.name} ${maxPlayers}-Player Table`);
                  }}
                  className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                    gameType === g.type
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-500/20 dark:border-emerald-500 dark:text-white font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <span className="text-xl">{g.icon}</span>
                  <span className="text-xs">{g.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Room Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Room Title</label>
            <input
              type="text"
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Player Capacity (Minimum 2) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Table Size (Minimum 2 Players)
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setMaxPlayers(count);
                    setTitle((prev) => prev.replace(/\d+-Player Table$/, `${count}-Player Table`));
                  }}
                  className={`py-2.5 px-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                    maxPlayers === count
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-800 dark:bg-cyan-500/20 dark:border-cyan-400 dark:text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400'
                  }`}
                >
                  {count} Players{count === 2 ? ' (Min)' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Stake Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
              <Coins className="w-4 h-4 text-amber-500 dark:text-amber-400" /> Betting Stake (₦ NGN per player · Max Pot ₦{(stake * maxPlayers).toLocaleString()})
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {NAIRA_STAKES.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => { soundManager.playClick(); setStake(amt); }}
                  className={`py-2 px-1.5 rounded-xl text-xs font-mono font-bold transition-all tabular-nums whitespace-nowrap ${
                    stake === amt
                      ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
                      : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  ₦{amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Room Visibility */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Who Can Join
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  setVisibility('public');
                }}
                className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 ${
                  visibility === 'public'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-500/20 dark:border-emerald-500 dark:text-white font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400'
                }`}
              >
                <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="block font-semibold">Public Lobby</span>
                  <span className="text-[11px] opacity-80 font-normal">Anyone with link can join</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  setVisibility('private');
                }}
                className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 ${
                  visibility === 'private'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 dark:bg-amber-500/20 dark:border-amber-500 dark:text-white font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400'
                }`}
              >
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <span className="block font-semibold">Private Invite Only</span>
                  <span className="text-[11px] opacity-80 font-normal">Invited users only</span>
                </div>
              </button>
            </div>

            {visibility === 'private' && (
              <div className="mt-3 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-2">
                <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Invited Players (Usernames or Emails — Optional)
                </label>
                <input
                  type="text"
                  value={invitedInput}
                  onChange={(e) => setInvitedInput(e.target.value)}
                  placeholder="e.g. KingAce, friend@gmail.com (comma-separated)"
                  className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-500/40 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80 leading-relaxed">
                  Leave blank so anyone you send the secret private link to can join, or enter usernames/emails so only those invited players can join.
                </p>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 disabled:opacity-60 text-slate-950 font-extrabold rounded-xl text-sm shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              <span>{submitting ? 'Creating Room...' : `Create ${maxPlayers}-Player Room (₦${stake.toLocaleString()})`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
