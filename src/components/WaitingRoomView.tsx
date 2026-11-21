import { useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Link2,
  Share2,
  Users,
  Coins,
  Lock,
  Globe,
  XCircle,
  Play,
  UserPlus,
} from 'lucide-react';
import { GameRoom, GameType } from '../types';
import { parseInvitedHandles } from '../firebase';
import { soundManager } from '../utils/audio';

interface WaitingRoomViewProps {
  room: GameRoom;
  currentUserId: string;
  isHost: boolean;
  onStartMatch: () => Promise<void>;
  onCancelMatch: () => Promise<void>;
  onUpdateInvitedHandles?: (handles: string[]) => Promise<void>;
  onBackToLobby: () => void;
}

const GAME_LABELS: Record<GameType, { name: string; icon: string }> = {
  whot: { name: 'Whot! African Card Game', icon: '🃏' },
  checkers: { name: 'Checkers (Draughts)', icon: '🔴' },
  rps: { name: 'Rock Paper Scissors', icon: '✂️' },
  tictactoe: { name: 'X and O', icon: '❌' },
  memory: { name: 'Memory Match Pro', icon: '🧠' },
};

export function formatInviteUsername(username?: string): string {
  const cleaned = (username || 'player')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'player';
}

export function getRoomInviteUrl(
  roomId: string,
  username?: string,
  inviteToken?: string
): string {
  const safeUser = formatInviteUsername(username);
  if (typeof window === 'undefined') {
    const tokenParam = inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : '';
    return `/beto/${safeUser}?room=${roomId}${tokenParam}`;
  }
  const url = new URL(window.location.origin);
  url.pathname = `/beto/${safeUser}`;
  url.searchParams.set('room', roomId);
  if (inviteToken) {
    url.searchParams.set('invite', inviteToken);
  }
  return url.toString();
}

export function WaitingRoomView({
  room,
  currentUserId,
  isHost,
  onStartMatch,
  onCancelMatch,
  onUpdateInvitedHandles,
  onBackToLobby,
}: WaitingRoomViewProps) {
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [savingInvite, setSavingInvite] = useState(false);

  const inviterUsername = room.playerProfiles[currentUserId]?.name || room.hostName;
  const inviteUrl = getRoomInviteUrl(
    room.id,
    inviterUsername,
    room.visibility === 'private' ? room.inviteToken : undefined
  );
  const meta = GAME_LABELS[room.gameType];
  const minRequired = room.minPlayers || 2;
  const playersNeededForMin = Math.max(0, minRequired - room.currentPlayers);
  const canHostStartEarly = isHost && room.currentPlayers >= minRequired;

  const handleCopy = async () => {
    soundManager.playClick();
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback selection handled visually
    }
  };

  const handleNativeShare = async () => {
    soundManager.playClick();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Join my ${meta.name} match on BetArena`,
          text: `Stake ₦${room.stake.toLocaleString()} in "${room.title}" (${room.currentPlayers}/${room.maxPlayers} players seated)!`,
          url: inviteUrl,
        });
      } catch {
        // User dismissed share sheet
      }
    } else {
      await handleCopy();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              onBackToLobby();
            }}
            className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Lobbies
          </button>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {room.visibility === 'private' ? (
              <>
                <Lock className="w-4 h-4 text-amber-500" />
                <span>Private Invite Room</span>
              </>
            ) : (
              <>
                <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Public Lobby + Invite Link</span>
              </>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-7">
          {/* Match Overview */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <span>{meta.icon}</span>
                <span>{meta.name}</span>
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {room.title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {playersNeededForMin > 0
                  ? `Waiting for ${playersNeededForMin} more real ${playersNeededForMin === 1 ? 'player' : 'players'} to reach the minimum of ${minRequired} players.`
                  : room.maxPlayers > minRequired
                  ? `Minimum ${minRequired} players reached! Host can start now or wait for up to ${room.maxPlayers} players.`
                  : 'All seats filled! Starting match...'}
              </p>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-right shrink-0">
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 block">
                Current Pot ({room.currentPlayers}/{room.maxPlayers} Players)
              </span>
              <span className="text-lg font-mono font-extrabold text-amber-700 dark:text-amber-300 tabular-nums flex items-center justify-end gap-1.5">
                <Coins className="w-4 h-4" /> ₦{(room.stake * room.currentPlayers).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Seat Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span>
                Seated Players: {room.currentPlayers} / {room.maxPlayers}
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                Min {minRequired} Required
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (room.currentPlayers / room.maxPlayers) * 100)}%` }}
              />
            </div>
          </div>

          {/* Seats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {Array.from({ length: room.maxPlayers }).map((_, idx) => {
              const uid = room.playerIds[idx];
              const profile = uid ? room.playerProfiles[uid] : null;
              const isSeatHost = uid === room.hostId;
              const isSeatMe = uid === currentUserId;
              const isMinRequiredSeat = idx < minRequired;

              if (uid && profile) {
                return (
                  <div
                    key={uid}
                    className={`p-4 rounded-2xl border flex items-center gap-3 ${
                      isSeatMe
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-500/40'
                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <img
                      src={profile.avatar}
                      alt={profile.name}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full object-cover border-2 border-emerald-500 bg-slate-200 dark:bg-slate-800 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 block">
                        Seat {idx + 1} {isSeatHost ? '· Host' : ''} {isSeatMe ? '· You' : ''}
                      </span>
                      <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {profile.name}
                      </p>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Staked ₦{room.stake.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={`empty-${idx}`}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Seat {idx + 1} · {isMinRequiredSeat ? 'Required' : 'Optional'}
                    </span>
                    <p className="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      Waiting for player...
                    </p>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Join via invite link
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Invite Link Box */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="room-invite-url"
                className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {room.visibility === 'private'
                    ? 'Private Invite Link (Invited Only)'
                    : 'Public Match Link (Anyone Can Join)'}
                </span>
              </label>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {room.visibility === 'private' ? 'Private Room' : `Code: ${room.id}`}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="room-invite-url"
                type="text"
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Link Copied' : 'Copy Invite Link'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Share2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Share</span>
              </button>
            </div>

            {room.visibility === 'private' ? (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  {room.invitedHandles.length > 0
                    ? 'Only the invited players listed below with this private invite link can join.'
                    : 'Only players given this secret private invite link can join (raw room codes are blocked).'}
                </p>

                {room.invitedHandles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {room.invitedHandles.map((handle) => (
                      <span
                        key={handle}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100/80 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 text-[11px] font-semibold text-amber-900 dark:text-amber-200"
                      >
                        <span>{handle}</span>
                        {isHost && onUpdateInvitedHandles && (
                          <button
                            type="button"
                            disabled={savingInvite}
                            onClick={async () => {
                              setSavingInvite(true);
                              try {
                                await onUpdateInvitedHandles(
                                  room.invitedHandles.filter((h) => h !== handle)
                                );
                              } finally {
                                setSavingInvite(false);
                              }
                            }}
                            className="text-amber-700 hover:text-rose-600 dark:text-amber-300 dark:hover:text-rose-400 font-bold"
                            aria-label={`Remove ${handle}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {isHost && onUpdateInvitedHandles && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const added = parseInvitedHandles(inviteInput);
                      if (added.length === 0) return;
                      setSavingInvite(true);
                      try {
                        await onUpdateInvitedHandles(
                          Array.from(new Set([...room.invitedHandles, ...added])).slice(0, 20)
                        );
                        setInviteInput('');
                      } finally {
                        setSavingInvite(false);
                      }
                    }}
                    className="flex flex-col sm:flex-row gap-2"
                  >
                    <input
                      type="text"
                      value={inviteInput}
                      onChange={(e) => setInviteInput(e.target.value)}
                      placeholder="Invite username or email (e.g. KingAce, friend@gmail.com)"
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={savingInvite || !inviteInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{savingInvite ? 'Saving...' : 'Invite Player'}</span>
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Public link: anyone with this link or from the lobby can join an open seat.
              </p>
            )}
          </div>

          {/* Host Start Early / Cancel Actions */}
          {isHost && (
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800 flex-wrap">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Match unlocks at {minRequired} seated players (auto-starts at {room.maxPlayers}).
              </p>
              <div className="flex items-center gap-2.5 flex-wrap">
                {canHostStartEarly && (
                  <button
                    type="button"
                    disabled={starting}
                    onClick={async () => {
                      soundManager.playClick();
                      setStarting(true);
                      try {
                        await onStartMatch();
                      } finally {
                        setStarting(false);
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 whitespace-nowrap"
                  >
                    <Play className="w-4 h-4" />
                    <span>{starting ? 'Starting...' : `Start Match (${room.currentPlayers} Players)`}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={cancelling}
                  onClick={async () => {
                    soundManager.playClick();
                    setCancelling(true);
                    try {
                      await onCancelMatch();
                    } finally {
                      setCancelling(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:border-rose-500/30 dark:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <XCircle className="w-4 h-4" />
                  <span>{cancelling ? 'Cancelling...' : 'Cancel Match'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
