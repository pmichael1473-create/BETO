import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Trophy, RotateCcw, HelpCircle } from 'lucide-react';
import { GameRoom } from '../types';
import { soundManager } from '../utils/audio';
import confetti from 'canvas-confetti';
import { TutorialModal } from '../components/TutorialModal';

interface WhotGameProps {
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

type Shape = 'circle' | 'triangle' | 'square' | 'cross' | 'star';

interface Card {
  id: string;
  shape: Shape;
  number: number;
}

const SHAPES: Shape[] = ['circle', 'triangle', 'square', 'cross', 'star'];
const SHAPE_ICONS: Record<Shape, string> = {
  circle: '⭕',
  triangle: '🔺',
  square: '⏹️',
  cross: '➕',
  star: '⭐',
};

const SHAPE_COLORS: Record<Shape, string> = {
  circle:
    'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-emerald-500/15 dark:bg-emerald-950/90 dark:border-emerald-500 dark:text-emerald-300 dark:shadow-emerald-500/20',
  triangle:
    'bg-amber-50 border-amber-500 text-amber-800 shadow-amber-500/15 dark:bg-amber-950/90 dark:border-amber-500 dark:text-amber-300 dark:shadow-amber-500/20',
  square:
    'bg-blue-50 border-blue-500 text-blue-800 shadow-blue-500/15 dark:bg-blue-950/90 dark:border-blue-500 dark:text-blue-300 dark:shadow-blue-500/20',
  cross:
    'bg-rose-50 border-rose-500 text-rose-800 shadow-rose-500/15 dark:bg-rose-950/90 dark:border-rose-500 dark:text-rose-300 dark:shadow-rose-500/20',
  star: 'bg-purple-50 border-purple-500 text-purple-800 shadow-purple-500/15 dark:bg-purple-950/90 dark:border-purple-500 dark:text-purple-300 dark:shadow-purple-500/20',
};

export function WhotGame({
  room,
  currentUserId,
  onUpdateMatch,
  onGameOver,
  onBack,
}: WhotGameProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const settledRef = useRef(false);

  const playerCount = Math.max(1, room.playerIds.length);
  const gs = room.gameState || {};
  const hands = (gs.hands as Record<string, Card[]>) || {};
  const topCard = (gs.topCard as Card) || { id: 'top-1', shape: 'circle', number: 5 };
  const rawTurnIndex = typeof gs.turnIndex === 'number' ? gs.turnIndex : 0;
  const turnIndex = rawTurnIndex % playerCount;
  const activePlayerId = room.playerIds[turnIndex] || room.hostId;
  const activePlayerName = room.playerProfiles[activePlayerId]?.name || 'Player';

  const message =
    localError ||
    (typeof gs.message === 'string' && gs.message
      ? gs.message
      : `${activePlayerName}'s turn!`);

  const myHand = Array.isArray(hands[currentUserId]) ? hands[currentUserId] : [];
  const myName = room.playerProfiles[currentUserId]?.name || 'You';
  const potTotal = room.stake * room.currentPlayers;

  const gameEnded = room.status === 'completed';
  const isWon = gameEnded && room.winnerId === currentUserId;
  const isMyTurn = !gameEnded && activePlayerId === currentUserId;

  useEffect(() => {
    if (room.status === 'completed' && !settledRef.current) {
      settledRef.current = true;
      if (room.winnerId === currentUserId) {
        soundManager.playWin();
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
        onGameOver(true, potTotal, false);
      } else {
        soundManager.playClick();
        onGameOver(false, 0, false);
      }
    }
  }, [room.status, room.winnerId, potTotal, currentUserId, onGameOver]);

  const handlePlayCard = async (card: Card) => {
    if (!isMyTurn || isSubmitting || gameEnded) return;

    if (card.shape !== topCard.shape && card.number !== topCard.number) {
      soundManager.playClick();
      setLocalError("Invalid move! Card must match top card's shape or number.");
      window.setTimeout(() => setLocalError(null), 2000);
      return;
    }

    soundManager.playCardFlip();
    setLocalError(null);
    setIsSubmitting(true);
    try {
      const nextMyHand = myHand.filter((c) => c.id !== card.id);
      const nextHands = { ...hands, [currentUserId]: nextMyHand };

      if (nextMyHand.length === 0) {
        await onUpdateMatch(
          {
            hands: nextHands,
            topCard: card,
            turnIndex,
            message: `${myName} played their final card and won!`,
          },
          'completed',
          currentUserId
        );
      } else {
        const nextTurnIndex = (turnIndex + 1) % playerCount;
        const nextUid = room.playerIds[nextTurnIndex];
        const nextName = room.playerProfiles[nextUid]?.name || 'Next Player';
        await onUpdateMatch(
          {
            hands: nextHands,
            topCard: card,
            turnIndex: nextTurnIndex,
            message: `${myName} played ${card.shape} ${card.number}. ${nextName}'s turn!`,
          },
          'in_progress',
          ''
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrawCard = async () => {
    if (!isMyTurn || isSubmitting || gameEnded) return;
    soundManager.playCardFlip();
    setLocalError(null);
    setIsSubmitting(true);
    try {
      const newCard: Card = {
        id: `drawn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        number: Math.floor(Math.random() * 10) + 1,
      };
      const nextMyHand = [...myHand, newCard];
      const nextHands = { ...hands, [currentUserId]: nextMyHand };
      const nextTurnIndex = (turnIndex + 1) % playerCount;
      const nextUid = room.playerIds[nextTurnIndex];
      const nextName = room.playerProfiles[nextUid]?.name || 'Next Player';

      await onUpdateMatch(
        {
          hands: nextHands,
          topCard,
          turnIndex: nextTurnIndex,
          message: `${myName} drew a card. ${nextName}'s turn!`,
        },
        'in_progress',
        ''
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const winnerName =
    room.winnerId && room.playerProfiles[room.winnerId]
      ? room.playerProfiles[room.winnerId].name
      : 'Winner';

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
            <span>🃏</span> Whot! ({room.currentPlayers}-Player Card Arena)
          </h2>
          <p className="text-xs text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            Pot Stake: ₦{potTotal.toLocaleString()}
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
                : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400'
            }`}
          >
            {gameEnded ? 'Match Ended' : isMyTurn ? 'Your Turn' : `${activePlayerName}'s Turn`}
          </div>
        </div>
      </div>

      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        gameType="whot"
      />

      {/* Seated Players Table Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {room.playerIds.map((uid, idx) => {
          const profile = room.playerProfiles[uid];
          const count = Array.isArray(hands[uid]) ? hands[uid].length : 0;
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
                <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {count} cards
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center Game Table */}
      <div className="rounded-3xl bg-gradient-to-b from-emerald-50 via-white to-teal-50 dark:from-emerald-950 dark:via-slate-900 dark:to-emerald-950 border border-emerald-200 dark:border-emerald-500/30 p-6 sm:p-8 flex flex-col justify-between shadow-xl dark:shadow-2xl min-h-[440px]">
        <div className="text-center">
          <span className="px-5 py-2 rounded-xl bg-white/95 dark:bg-slate-950/90 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold shadow-md inline-block">
            {message}
          </span>
        </div>

        {/* Center Discard & Draw Pile */}
        <div className="flex items-center justify-center gap-8 my-6">
          <div className="text-center">
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-2">
              Top Discard Card
            </p>
            <div
              className={`w-24 h-36 rounded-2xl border-2 ${SHAPE_COLORS[topCard.shape]} shadow-xl flex flex-col items-center justify-between p-4`}
            >
              <span className="text-2xl">{SHAPE_ICONS[topCard.shape]}</span>
              <span className="text-3xl font-extrabold font-mono">{topCard.number}</span>
              <span className="text-[10px] uppercase tracking-wider opacity-80">
                {topCard.shape}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={!isMyTurn || isSubmitting || gameEnded}
            onClick={() => void handleDrawCard()}
            className={`w-24 h-36 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-950 border-2 border-slate-300 dark:border-slate-700 shadow-lg flex flex-col items-center justify-center transition-all group ${
              isMyTurn
                ? 'cursor-pointer hover:border-emerald-500'
                : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📥</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2">
              Draw Deck
            </span>
          </button>
        </div>

        {/* Local Player Hand */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 px-2">
            <span>Your Hand ({myName})</span>
            <span className="font-mono tabular-nums">{myHand.length} cards</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-2 justify-center flex-wrap">
            {myHand.map((card) => {
              const isValid = card.shape === topCard.shape || card.number === topCard.number;
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={!isMyTurn || isSubmitting || gameEnded}
                  onClick={() => void handlePlayCard(card)}
                  className={`w-20 h-28 sm:w-24 sm:h-36 shrink-0 rounded-2xl border-2 ${SHAPE_COLORS[card.shape]} shadow-lg flex flex-col items-center justify-between p-3 transition-all ${
                    isMyTurn && isValid
                      ? 'ring-2 ring-emerald-500 dark:ring-emerald-400 shadow-emerald-500/30 cursor-pointer hover:-translate-y-2'
                      : isMyTurn
                      ? 'opacity-75 cursor-pointer hover:-translate-y-1'
                      : 'opacity-65 cursor-not-allowed'
                  }`}
                >
                  <span className="text-xl">{SHAPE_ICONS[card.shape]}</span>
                  <span className="text-2xl font-extrabold font-mono">{card.number}</span>
                  <span className="text-[9px] uppercase tracking-wider opacity-80">
                    {card.shape}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {gameEnded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div
              className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center ${
                isWon
                  ? 'bg-emerald-100 text-emerald-600 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40'
                  : 'bg-rose-100 text-rose-600 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/40'
              }`}
            >
              {isWon ? <Trophy className="w-10 h-10" /> : <RotateCcw className="w-10 h-10" />}
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                {isWon ? 'Victory! Pot Won!' : 'Defeat! Match Over'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                {isWon
                  ? `You won ₦${potTotal.toLocaleString()} from the ${room.currentPlayers}-player pot.`
                  : `${winnerName} emptied their hand first.`}
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
