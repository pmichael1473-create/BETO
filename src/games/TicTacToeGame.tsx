import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Trophy, Handshake, RotateCcw } from 'lucide-react';
import { GameRoom } from '../types';
import { soundManager } from '../utils/audio';
import confetti from 'canvas-confetti';

interface TicTacToeGameProps {
  room: GameRoom;
  currentUserId: string;
  onUpdateMatch: (
    gameState: Record<string, unknown>,
    status?: 'in_progress' | 'completed',
    winnerId?: string
  ) => Promise<void>;
  onGameOver: (won: boolean, reward: number, isTie?: boolean) => void;
  onBack: () => void;
}

const SYMBOLS = ['X', 'O', '▲', '◆', '★', '●'] as const;
const SYMBOL_STYLES: Record<string, string> = {
  X: 'text-emerald-600 border-emerald-400 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-500/50 dark:bg-emerald-950/30',
  O: 'text-rose-600 border-rose-400 bg-rose-50 dark:text-rose-400 dark:border-rose-500/50 dark:bg-rose-950/30',
  '▲': 'text-amber-600 border-amber-400 bg-amber-50 dark:text-amber-400 dark:border-amber-500/50 dark:bg-amber-950/30',
  '◆': 'text-cyan-600 border-cyan-400 bg-cyan-50 dark:text-cyan-400 dark:border-cyan-500/50 dark:bg-cyan-950/30',
  '★': 'text-purple-600 border-purple-400 bg-purple-50 dark:text-purple-400 dark:border-purple-500/50 dark:bg-purple-950/30',
  '●': 'text-blue-600 border-blue-400 bg-blue-50 dark:text-blue-400 dark:border-blue-500/50 dark:bg-blue-950/30',
};

function check5x5Winner(b: string[]): string | 'tie' | null {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const sym = b[r * 5 + c];
      if (!sym) continue;
      for (const [dr, dc] of dirs) {
        const r2 = r + dr * 2;
        const c2 = c + dc * 2;
        if (r2 >= 0 && r2 < 5 && c2 >= 0 && c2 < 5) {
          if (b[(r + dr) * 5 + (c + dc)] === sym && b[r2 * 5 + c2] === sym) {
            return sym;
          }
        }
      }
    }
  }
  if (b.every((cell) => cell !== '')) return 'tie';
  return null;
}

export function TicTacToeGame({
  room,
  currentUserId,
  onUpdateMatch,
  onGameOver,
  onBack,
}: TicTacToeGameProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const settledRef = useRef(false);

  const playerCount = Math.max(1, room.playerIds.length);
  const myIndex = room.playerIds.indexOf(currentUserId);
  const mySymbol = myIndex >= 0 ? SYMBOLS[myIndex % SYMBOLS.length] : 'X';

  const gs = room.gameState || {};
  const board: string[] =
    Array.isArray(gs.board) && gs.board.length === 25
      ? gs.board.map((c) => (typeof c === 'string' ? c : ''))
      : Array(25).fill('');
  const rawTurnIndex = typeof gs.turnIndex === 'number' ? gs.turnIndex : 0;
  const turnIndex = rawTurnIndex % playerCount;
  const activePlayerId = room.playerIds[turnIndex] || room.hostId;
  const activePlayerName = room.playerProfiles[activePlayerId]?.name || 'Player';
  const activeSymbol = SYMBOLS[turnIndex % SYMBOLS.length];

  const message =
    typeof gs.message === 'string' && gs.message
      ? gs.message
      : `${activePlayerName}'s turn (${activeSymbol}). Align 3 in a row!`;

  const potTotal = room.stake * room.currentPlayers;
  const gameEnded = room.status === 'completed';
  const isTie = gameEnded && room.winnerId === 'tie';
  const isWon = gameEnded && room.winnerId === currentUserId;
  const isMyTurn = !gameEnded && activePlayerId === currentUserId;

  useEffect(() => {
    if (room.status === 'completed' && !settledRef.current) {
      settledRef.current = true;
      if (room.winnerId === 'tie') {
        soundManager.playClick();
        onGameOver(false, room.stake, true);
      } else if (room.winnerId === currentUserId) {
        soundManager.playWin();
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
        onGameOver(true, potTotal, false);
      } else {
        soundManager.playClick();
        onGameOver(false, 0, false);
      }
    }
  }, [room.status, room.winnerId, room.stake, potTotal, currentUserId, onGameOver]);

  const handleCellClick = async (idx: number) => {
    if (!isMyTurn || isSubmitting || board[idx] !== '') return;
    soundManager.playClick();
    setIsSubmitting(true);

    try {
      const nextBoard = [...board];
      nextBoard[idx] = mySymbol;

      const winner = check5x5Winner(nextBoard);
      if (winner === 'tie') {
        await onUpdateMatch(
          {
            board: nextBoard,
            turnIndex,
            message: "Board full! It's a tie — stakes refunded.",
          },
          'completed',
          'tie'
        );
      } else if (winner) {
        const winnerName = room.playerProfiles[currentUserId]?.name || 'Winner';
        await onUpdateMatch(
          {
            board: nextBoard,
            turnIndex,
            message: `${winnerName} (${mySymbol}) aligned 3 and won the pot!`,
          },
          'completed',
          currentUserId
        );
      } else {
        const nextTurnIndex = (turnIndex + 1) % playerCount;
        const nextUid = room.playerIds[nextTurnIndex];
        const nextName = room.playerProfiles[nextUid]?.name || 'Next Player';
        const nextSym = SYMBOLS[nextTurnIndex % SYMBOLS.length];
        await onUpdateMatch(
          {
            board: nextBoard,
            turnIndex: nextTurnIndex,
            message: `${nextName}'s turn (${nextSym}).`,
          },
          'in_progress',
          ''
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const winnerName =
    room.winnerId && room.winnerId !== 'tie'
      ? room.playerProfiles[room.winnerId]?.name || 'Winner'
      : '';

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6 animate-fade-in font-sans">
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-4 shadow-lg dark:shadow-xl flex-wrap gap-3">
        <button
          onClick={() => {
            soundManager.playClick();
            onBack();
          }}
          className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Leave Arena
        </button>
        <div className="text-center">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center justify-center gap-2">
            <span>❌</span> X and O ({room.currentPlayers}-Player 5x5 Arena)
          </h2>
          <p className="text-xs text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            Pot Stake: ₦{potTotal.toLocaleString()} · Align 3 to Win
          </p>
        </div>
        <div
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border ${
            isMyTurn
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-400'
          }`}
        >
          {gameEnded
            ? 'Match Ended'
            : isMyTurn
            ? `Your Turn (${mySymbol})`
            : `${activePlayerName}'s Turn (${activeSymbol})`}
        </div>
      </div>

      {/* Seated Players Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {room.playerIds.map((uid, idx) => {
          const profile = room.playerProfiles[uid];
          const sym = SYMBOLS[idx % SYMBOLS.length];
          const isActive = !gameEnded && idx === turnIndex;
          const isMe = uid === currentUserId;
          return (
            <div
              key={uid}
              className={`p-3 rounded-2xl bg-white dark:bg-slate-900 border flex items-center gap-2.5 transition-all ${
                isActive
                  ? 'border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <img
                src={profile?.avatar || room.hostAvatar}
                alt={profile?.name || 'Player'}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-slate-300 dark:border-slate-700 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                  {profile?.name || 'Player'}
                  {isMe ? ' (You)' : ''}
                </p>
                <p className="text-[11px] font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                  Mark: {sym}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5x5 Grid Arena */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex flex-col items-center shadow-xl dark:shadow-2xl space-y-6">
        <div className="text-center">
          <span className="px-5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-700 text-cyan-700 dark:text-cyan-300 text-xs font-bold shadow-sm inline-block">
            {message}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2.5 sm:gap-3 w-full max-w-md aspect-square">
          {board.map((cell, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => void handleCellClick(idx)}
              disabled={cell !== '' || !isMyTurn || isSubmitting || gameEnded}
              className={`rounded-xl sm:rounded-2xl border-2 text-2xl sm:text-3xl font-extrabold flex items-center justify-center transition-all shadow-sm ${
                cell && SYMBOL_STYLES[cell]
                  ? SYMBOL_STYLES[cell]
                  : isMyTurn
                  ? 'bg-slate-50 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 dark:bg-slate-950 dark:border-slate-800 dark:hover:border-emerald-500/60 dark:hover:bg-slate-900 cursor-pointer'
                  : 'bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800 opacity-75 cursor-not-allowed'
              }`}
            >
              {cell}
            </button>
          ))}
        </div>
      </div>

      {gameEnded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div
              className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center ${
                isTie
                  ? 'bg-amber-100 text-amber-600 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/40'
                  : isWon
                  ? 'bg-emerald-100 text-emerald-600 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40'
                  : 'bg-rose-100 text-rose-600 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/40'
              }`}
            >
              {isTie ? (
                <Handshake className="w-10 h-10" />
              ) : isWon ? (
                <Trophy className="w-10 h-10" />
              ) : (
                <RotateCcw className="w-10 h-10" />
              )}
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                {isTie ? 'Draw Match!' : isWon ? 'Victory! Pot Won!' : 'Match Over'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                {isTie
                  ? `Your stake of ₦${room.stake.toLocaleString()} has been refunded.`
                  : isWon
                  ? `You won ₦${potTotal.toLocaleString()} from the ${room.currentPlayers}-player pot.`
                  : `${winnerName} won the pot.`}
              </p>
            </div>
            <button
              onClick={() => {
                soundManager.playClick();
                onBack();
              }}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg transition-all"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
