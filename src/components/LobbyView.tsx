import { useState } from 'react';
import {
  Plus,
  Users,
  Coins,
  Gamepad2,
  Swords,
  Lock,
  LogIn,
  UserPlus,
  Link2,
  Copy,
  Check,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { GameRoom, GameType } from '../types';
import { soundManager } from '../utils/audio';
import { getRoomInviteUrl } from './WaitingRoomView';

interface LobbyViewProps {
  rooms: GameRoom[];
  currentUserId?: string;
  isAuthenticated: boolean;
  onRequireAuth: (mode: 'signin' | 'signup', reason?: string) => void;
  onJoinRoom: (room: GameRoom) => void;
  onJoinInviteCode: (rawInput: string) => Promise<void> | void;
  onCreateRoomClick: () => void;
}

const GAME_META: Record<GameType, { name: string; icon: string; desc: string; bg: string }> = {
  whot: {
    name: 'Whot! African Card Game',
    icon: '🃏',
    desc: 'Match shapes and numbers in this lightning-fast classic card duel.',
    bg: 'from-emerald-50 to-white border-emerald-200 dark:from-emerald-950 dark:to-emerald-900/60 dark:border-emerald-500/30',
  },
  checkers: {
    name: 'Checkers (Draughts)',
    icon: '🔴',
    desc: 'Capture opponent pieces and crown your kings to dominate the board.',
    bg: 'from-rose-50 to-white border-rose-200 dark:from-red-950 dark:to-amber-950/60 dark:border-red-500/30',
  },
  rps: {
    name: 'Rock Paper Scissors',
    icon: '✂️',
    desc: 'Fast best-of-5 tactical duel of rock, paper, and scissors.',
    bg: 'from-purple-50 to-white border-purple-200 dark:from-purple-950 dark:to-pink-950/60 dark:border-purple-500/30',
  },
  tictactoe: {
    name: 'X and O',
    icon: '❌',
    desc: 'Fast tactical 3x3 grid duel for quick wins and high payouts.',
    bg: 'from-indigo-50 to-white border-indigo-200 dark:from-purple-950 dark:to-slate-900 dark:border-purple-500/30',
  },
  memory: {
    name: 'Memory Match Pro',
    icon: '🧠',
    desc: 'Flip cards, remember positions, and race to 5 matching pairs first.',
    bg: 'from-cyan-50 to-white border-cyan-200 dark:from-cyan-950 dark:to-teal-950/60 dark:border-cyan-500/30',
  },
};

export function LobbyView({
  rooms,
  currentUserId,
  isAuthenticated,
  onRequireAuth,
  onJoinRoom,
  onJoinInviteCode,
  onCreateRoomClick,
}: LobbyViewProps) {
  const [filter, setFilter] = useState<GameType | 'all'>('all');
  const [inviteInput, setInviteInput] = useState('');
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);

  const filteredRooms = filter === 'all' ? rooms : rooms.filter((r) => r.gameType === filter);

  const handleCreateRoom = () => {
    soundManager.playClick();
    if (!isAuthenticated) {
      onRequireAuth('signup', 'Create an account or sign in before opening a game room.');
      return;
    }
    onCreateRoomClick();
  };

  const handleJoin = (room: GameRoom) => {
    if (!isAuthenticated) {
      soundManager.playClick();
      onRequireAuth('signin', `Sign in or sign up to join "${room.title}" and stake ₦${room.stake.toLocaleString()}.`);
      return;
    }
    soundManager.playCoin();
    onJoinRoom(room);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim()) return;
    soundManager.playClick();
    if (!isAuthenticated) {
      onRequireAuth('signin', 'Sign in or sign up before joining a room via invite link.');
      return;
    }
    setJoiningInvite(true);
    try {
      await onJoinInviteCode(inviteInput);
      setInviteInput('');
    } finally {
      setJoiningInvite(false);
    }
  };

  const handleCopyInvite = async (room: GameRoom) => {
    soundManager.playClick();
    try {
      await navigator.clipboard.writeText(
        getRoomInviteUrl(
          room.id,
          room.hostName,
          room.visibility === 'private' ? room.inviteToken : undefined
        )
      );
      setCopiedRoomId(room.id);
      setTimeout(() => setCopiedRoomId(null), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in py-6 px-4">
      {/* Hero Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-white via-emerald-50/90 to-slate-100 dark:from-slate-900 dark:via-emerald-950/80 dark:to-slate-900 border border-emerald-200 dark:border-emerald-500/30 p-8 md:p-12 overflow-hidden shadow-xl dark:shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none hidden md:block">
          <Gamepad2 className="w-64 h-64 text-emerald-500 dark:text-emerald-400" />
        </div>
        <div className="relative z-10 max-w-3xl space-y-4">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Live Player-vs-Player Arena · Real Opponents & Invite Links
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight text-balance">
            Challenge Real Players. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-cyan-600 dark:from-emerald-400 dark:to-cyan-400">
              Win Naira Stakes.
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base leading-relaxed">
            Create a live 2-to-6 player match room in Whot, Checkers, Rock Paper Scissors, X and O, or Memory Match, share your invite link with friends, or join an open player table.
          </p>

          {!isAuthenticated && (
            <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-200">
              <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Player account required:</strong> Sign up or sign in before creating rooms or joining matches.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!isAuthenticated ? (
              <>
                <button
                  onClick={() => { soundManager.playClick(); onRequireAuth('signup'); }}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 flex items-center gap-2 whitespace-nowrap"
                >
                  <UserPlus className="w-5 h-5" /> Sign Up to Play
                </button>
                <button
                  onClick={() => { soundManager.playClick(); onRequireAuth('signin'); }}
                  className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-semibold rounded-xl border border-slate-300 dark:border-slate-700 transition-all flex items-center gap-2 shadow-sm whitespace-nowrap"
                >
                  <LogIn className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /> Sign In
                </button>
              </>
            ) : (
              <button
                onClick={handleCreateRoom}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 flex items-center gap-2 whitespace-nowrap"
              >
                <Plus className="w-5 h-5" /> Create Room & Invite Player
              </button>
            )}
          </div>

          {/* Join via Invite Link / Code Bar */}
          <form onSubmit={handleInviteSubmit} className="pt-2 flex flex-col sm:flex-row gap-2.5 max-w-xl">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="Paste public or private invite link, or public room code"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={joiningInvite || !inviteInput.trim()}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{joiningInvite ? 'Joining...' : 'Join Invite'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Game Categories */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Featured Game Arenas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {(Object.keys(GAME_META) as GameType[]).map((type) => {
            const meta = GAME_META[type];
            return (
              <div
                key={type}
                onClick={() => { soundManager.playClick(); setFilter(type); }}
                className={`p-5 rounded-2xl bg-gradient-to-b ${meta.bg} border cursor-pointer hover:scale-[1.02] transition-all group flex flex-col justify-between shadow-sm hover:shadow-md`}
              >
                <div>
                  <span className="text-3xl block mb-3">{meta.icon}</span>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                    {type === 'tictactoe' ? 'X and O' : meta.name}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{meta.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span>Filter Rooms</span>
                  <Swords className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Rooms Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /> Live Player Rooms
            </h2>
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
              <button
                onClick={() => { soundManager.playClick(); setFilter('all'); }}
                className={`px-3 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  filter === 'all'
                    ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                All
              </button>
              {(Object.keys(GAME_META) as GameType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { soundManager.playClick(); setFilter(t); }}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    t === 'tictactoe' ? '' : 'capitalize '
                  }${
                    filter === t
                      ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {t === 'tictactoe' ? 'X and O' : t}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreateRoom}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Create Room
          </button>
        </div>

        {filteredRooms.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm px-4">
            <Users className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-700 dark:text-slate-300 font-semibold text-sm">
              {isAuthenticated
                ? 'No live player rooms right now.'
                : 'Sign in to view live rooms or join with an invite link.'}
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Create a room and share the invite link to challenge a real opponent!
            </p>
            <button
              onClick={handleCreateRoom}
              className="mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              {isAuthenticated ? 'Create Room & Get Invite Link' : 'Sign Up & Create Room'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((room) => {
              const meta = GAME_META[room.gameType];
              const isHost = Boolean(currentUserId && room.hostId === currentUserId);
              const isParticipant = Boolean(
                currentUserId && room.playerIds.includes(currentUserId)
              );
              const canJoin = room.status === 'waiting' && !isParticipant && room.currentPlayers < room.maxPlayers;

              return (
                <div
                  key={room.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-5 space-y-4 transition-all group flex flex-col justify-between shadow-sm hover:shadow-md dark:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-2xl mb-1.5 block">{meta.icon}</span>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors truncate">
                        {room.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span>{meta.name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          {room.visibility === 'private' ? (
                            <>
                              <Lock className="w-3 h-3 text-amber-500" /> Invite Only
                            </>
                          ) : (
                            <>
                              <Globe className="w-3 h-3 text-emerald-500" /> Public
                            </>
                          )}
                        </span>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1 shrink-0 tabular-nums">
                      <Coins className="w-3.5 h-3.5" /> ₦{room.stake.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={room.hostAvatar}
                        alt={room.hostName}
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 object-cover shrink-0"
                      />
                      <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                        {room.hostName}
                        {isHost ? ' (You)' : ''}
                      </span>
                    </div>
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0 tabular-nums">
                      <Users className="w-3.5 h-3.5" /> {room.currentPlayers}/{room.maxPlayers} (Min {room.minPlayers})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!canJoin && !isParticipant && isAuthenticated}
                      onClick={() => handleJoin(room)}
                      className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      {!isAuthenticated && <Lock className="w-3.5 h-3.5" />}
                      <span>
                        {!isAuthenticated
                          ? `Sign In to Join (₦${room.stake.toLocaleString()})`
                          : isParticipant
                          ? room.status === 'waiting'
                            ? 'Open Waiting Room'
                            : 'Resume Match'
                          : room.status === 'waiting' && room.currentPlayers < room.maxPlayers
                          ? `Join Seat (${room.currentPlayers}/${room.maxPlayers}) · ₦${room.stake.toLocaleString()}`
                          : 'Match Full / In Progress'}
                      </span>
                    </button>

                    {isAuthenticated && room.status === 'waiting' && (
                      <button
                        type="button"
                        onClick={() => void handleCopyInvite(room)}
                        title="Copy Invite Link"
                        aria-label="Copy Invite Link"
                        className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0"
                      >
                        {copiedRoomId === room.id ? (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
