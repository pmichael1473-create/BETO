import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Trophy, RotateCcw, HelpCircle, Brain, Handshake } from 'lucide-react';
import { GameRoom } from '../types';
import { soundManager } from '../utils/audio';
import confetti from 'canvas-confetti';
import { TutorialModal } from '../components/TutorialModal';

interface MemoryGameProps {
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

const CARD_META: Record<string, { symbol: string; label: string; accentClass: string }> = {
  crown: {
    symbol: '👑',
    label: 'Crown',
    accentClass:
      'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-400/70 dark:bg-amber-950/60 dark:text-amber-200',
  },
  diamond: {
    symbol: '💎',
    label: 'Gem',
    accentClass:
      'border-cyan-400 bg-cyan-50 text-cyan-900 dark:border-cyan-400/70 dark:bg-cyan-950/60 dark:text-cyan-200',
  },
  flame: {
    symbol: '🔥',
    label: 'Flame',
    accentClass:
      'border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-400/70 dark:bg-orange-950/60 dark:text-orange-200',
  },
  bolt: {
    symbol: '⚡',
    label: 'Volt',
    accentClass:
      'border-yellow-400 bg-yellow-50 text-yellow-900 dark:border-yellow-400/70 dark:bg-yellow-950/60 dark:text-yellow-200',
  },
  clover: {
    symbol: '🍀',
    label: 'Luck',
    accentClass:
      'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-400/70 dark:bg-emerald-950/60 dark:text-emerald-200',
  },
  spade: {
    symbol: '♠️',
    label: 'Spade',
    accentClass:
      'border-slate-400 bg-slate-100 text-slate-900 dark:border-slate-400/70 dark:bg-slate-800/80 dark:text-slate-100',
  },
  heart: {
    symbol: '♥️',
    label: 'Heart',
    accentClass:
      'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-400/70 dark:bg-rose-950/60 dark:text-rose-200',
  },
  star: {
    symbol: '🌟',
    label: 'Star',
    accentClass:
      'border-purple-400 bg-purple-50 text-purple-900 dark:border-purple-400/70 dark:bg-purple-950/60 dark:text-purple-200',
  },
  trophy: {
    symbol: '🏆',
    label: 'Cup',
    accentClass:
      'border-teal-400 bg-teal-50 text-teal-900 dark:border-teal-400/70 dark:bg-teal-950/60 dark:text-teal-200',
  },
};

export function MemoryGame({
  room,
  currentUserId,
  onUpdateMatch,
  onGameOver,
  onBack,
}: MemoryGameProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const settledRef = useRef(false);

  const playerCount = Math.max(1, room.playerIds.length);
  const gs = room.gameState || {};
  const deckPairIds = Array.isArray(gs.deckPairIds) ? (gs.deckPairIds as string[]) : [];
  const matchedBy = Array.isArray(gs.matchedBy)
    ? (gs.matchedBy as string[])
    : Array(deckPairIds.length).fill('');
  const flippedIndices = Array.isArray(gs.flippedIndices)
    ? (gs.flippedIndices as number[])
    : [];
  const rawTurnIndex = typeof gs.turnIndex === 'number' ? gs.turnIndex : 0;
  const turnIndex = rawTurnIndex % playerCount;
  const activePlayerId = room.playerIds[turnIndex] || room.hostId;
  const activePlayerName = room.playerProfiles[activePlayerId]?.name || 'Player';
  const scores = (gs.scores as Record<string, number>) || {};

  const message =
    typeof gs.message === 'string' && gs.message
      ? gs.message
      : `${activePlayerName}'s turn!`;

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

  useEffect(() => {
    if (!isMyTurn || flippedIndices.length !== 2 || room.status !== 'in_progress') return;

    const timer = window.setTimeout(async () => {
      const [firstIdx, secondIdx] = flippedIndices;
      const isMatch = deckPairIds[firstIdx] === deckPairIds[secondIdx];

      if (isMatch) {
        soundManager.playCoin();
        const nextMatched = [...matchedBy];
        nextMatched[firstIdx] = currentUserId;
        nextMatched[secondIdx] = currentUserId;

        const nextScores = { ...scores };
        room.playerIds.forEach((uid) => {
          if (typeof nextScores[uid] !== 'number') nextScores[uid] = 0;
        });
        nextScores[currentUserId] = (nextScores[currentUserId] || 0) + 1;

        const allMatched = nextMatched.every((owner) => owner !== '');
        const myNextScore = nextScores[currentUserId];
        const sorted = [...room.playerIds].sort(
          (a, b) => (nextScores[b] || 0) - (nextScores[a] || 0)
        );
        const topUid = sorted[0];
        const topScore = nextScores[topUid] || 0;
        const secondScore = sorted.length > 1 ? nextScores[sorted[1]] || 0 : 0;
        const myName = room.playerProfiles[currentUserId]?.name || 'Player';

        if (allMatched || myNextScore >= 5) {
          const isDraw = topScore === secondScore;
          const winnerId = isDraw ? 'tie' : topUid;
          const winnerName = room.playerProfiles[topUid]?.name || 'Champion';
          await onUpdateMatch(
            {
              deckPairIds,
              matchedBy: nextMatched,
              flippedIndices: [],
              turnIndex,
              scores: nextScores,
              message: isDraw
                ? `Tied at ${topScore} pairs! Stakes refunded.`
                : `${winnerName} wins with ${topScore} pairs!`,
            },
            'completed',
            winnerId
          );
        } else {
          await onUpdateMatch(
            {
              deckPairIds,
              matchedBy: nextMatched,
              flippedIndices: [],
              turnIndex,
              scores: nextScores,
              message: `${myName} found a match! Bonus turn.`,
            },
            'in_progress',
            ''
          );
        }
      } else {
        const nextTurnIndex = (turnIndex + 1) % playerCount;
        const nextUid = room.playerIds[nextTurnIndex];
        const nextName = room.playerProfiles[nextUid]?.name || 'Next Player';
        await onUpdateMatch(
          {
            deckPairIds,
            matchedBy,
            flippedIndices: [],
            turnIndex: nextTurnIndex,
            scores,
            message: `No match! ${nextName}'s turn.`,
          },
          'in_progress',
          ''
        );
      }
    }, 850);

    return () => window.clearTimeout(timer);
  }, [
    isMyTurn,
    flippedIndices,
    room.status,
    room.playerIds,
    room.playerProfiles,
    playerCount,
    deckPairIds,
    matchedBy,
    turnIndex,
    scores,
    currentUserId,
    onUpdateMatch,
  ]);

  const handleCardClick = async (index: number) => {
    if (!isMyTurn || isSubmitting || gameEnded) return;
    if (flippedIndices.length >= 2 || flippedIndices.includes(index)) return;
    if (matchedBy[index]) return;

    soundManager.playCardFlip();
    setIsSubmitting(true);
    try {
      const nextFlipped = [...flippedIndices, index];
      const myName = room.playerProfiles[currentUserId]?.name || 'Player';
      await onUpdateMatch(
        {
          deckPairIds,
          matchedBy,
          flippedIndices: nextFlipped,
          turnIndex,
          scores,
          message:
            nextFlipped.length === 1
              ? `${myName} flipped a card. Pick one more!`
              : 'Checking pair...',
        },
        'in_progress',
        ''
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const winnerName =
    room.winnerId && room.winnerId !== 'tie'
      ? room.playerProfiles[room.winnerId]?.name || 'Champion'
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
            <Brain className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /> Memory Match ({room.currentPlayers}-Player Arena)
          </h2>
          <p className="text-xs text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            Pot Stake: ₦{potTotal.toLocaleString()} · Most Pairs Wins
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              soundManager.playClick();
              setIsTutorialOpen(true);
            }}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-cyan-600 dark:text-cyan-400 transition-colors"
            title="Game Rules & Tutorial"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <div
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border ${
              isMyTurn
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-400'
            }`}
          >
            {gameEnded ? 'Match Ended' : isMyTurn ? 'Your Turn' : `${activePlayerName}'s Turn`}
          </div>
        </div>
      </div>

      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        gameType="memory"
      />

      {/* Seated Players Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {room.playerIds.map((uid, idx) => {
          const profile = room.playerProfiles[uid];
          const score = typeof scores[uid] === 'number' ? scores[uid] : 0;
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
                <p className="text-[11px] font-mono font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {score} pairs
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 6x3 Card Grid */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex flex-col items-center shadow-xl dark:shadow-2xl space-y-5">
        <div className="text-center">
          <span className="px-5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-700 text-cyan-700 dark:text-cyan-300 text-xs font-bold shadow-sm inline-block">
            {message}
          </span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 w-full max-w-2xl">
          {deckPairIds.map((pairId, idx) => {
            const meta = CARD_META[pairId] || CARD_META.star;
            const ownerUid = matchedBy[idx] || '';
            const isFlipped = flippedIndices.includes(idx);
            const revealed = isFlipped || ownerUid !== '';
            const matchedByMe = ownerUid === currentUserId;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => void handleCardClick(idx)}
                disabled={
                  revealed || !isMyTurn || isSubmitting || flippedIndices.length >= 2 || gameEnded
                }
                aria-label={revealed ? `${meta.label} card` : `Face-down card ${idx + 1}`}
                className={`min-h-[82px] aspect-[3/4] rounded-2xl border-2 flex flex-col items-center justify-center p-2 transition-transform duration-200 select-none ${
                  ownerUid !== ''
                    ? matchedByMe
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-200 shadow-lg scale-95'
                      : 'border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-400/80 dark:bg-rose-950/60 dark:text-rose-200 shadow-lg scale-95'
                    : isFlipped
                    ? `${meta.accentClass} shadow-xl scale-105`
                    : isMyTurn
                    ? 'border-slate-300 bg-gradient-to-br from-slate-100 to-slate-200 hover:border-cyan-500 dark:border-slate-700 dark:from-slate-800 dark:to-slate-950 dark:hover:border-cyan-400/60 hover:-translate-y-0.5 cursor-pointer shadow-md'
                    : 'border-slate-300 bg-gradient-to-br from-slate-100 to-slate-200 dark:border-slate-700 dark:from-slate-800 dark:to-slate-950 opacity-75 cursor-not-allowed shadow-md'
                }`}
              >
                {revealed ? (
                  <>
                    <span className="text-2xl sm:text-3xl leading-none">{meta.symbol}</span>
                    <span className="text-[10px] font-semibold mt-1.5 tracking-wide opacity-90">
                      {meta.label}
                    </span>
                    {ownerUid !== '' && (
                      <span className="text-[9px] font-mono uppercase mt-0.5 opacity-75 truncate max-w-full">
                        {matchedByMe ? 'You' : room.playerProfiles[ownerUid]?.name?.slice(0, 8) || 'Opp'}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-lg font-bold text-slate-400 dark:text-slate-600">?</span>
                )}
              </button>
            );
          })}
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
                {isTie ? 'Tie Match!' : isWon ? 'Victory! Pot Won!' : 'Defeat! Match Over'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                {isTie
                  ? `Top players tied — your stake of ₦${room.stake.toLocaleString()} has been refunded.`
                  : isWon
                  ? `You won ₦${potTotal.toLocaleString()} from the ${room.currentPlayers}-player pot.`
                  : `${winnerName} matched the most pairs.`}
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
