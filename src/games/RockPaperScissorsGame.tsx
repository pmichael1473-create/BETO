import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Trophy, RotateCcw, CheckCircle2, Clock } from 'lucide-react';
import { GameRoom } from '../types';
import { submitRpsChoice } from '../firebase';
import { soundManager } from '../utils/audio';
import confetti from 'canvas-confetti';

interface RockPaperScissorsGameProps {
  room: GameRoom;
  currentUserId: string;
  onGameOver: (won: boolean, reward: number, isTie?: boolean) => void;
  onBack: () => void;
}

type Choice = 'rock' | 'paper' | 'scissors';

const CHOICES: { id: Choice; name: string; icon: string }[] = [
  { id: 'rock', name: 'Rock', icon: '✊' },
  { id: 'paper', name: 'Paper', icon: '✋' },
  { id: 'scissors', name: 'Scissors', icon: '✌️' },
];

const TARGET_POINTS = 6;

export function RockPaperScissorsGame({
  room,
  currentUserId,
  onGameOver,
  onBack,
}: RockPaperScissorsGameProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const settledRef = useRef(false);

  const gs = room.gameState || {};
  const scores = (gs.scores as Record<string, number>) || {};
  const choices = (gs.choices as Record<string, string>) || {};
  const lastChoices = (gs.lastChoices as Record<string, string>) || {};
  const round = typeof gs.round === 'number' ? gs.round : 1;
  const message =
    typeof gs.message === 'string' && gs.message
      ? gs.message
      : `Round ${round}: Lock in Rock, Paper, or Scissors!`;

  const myPendingChoice = (choices[currentUserId] as Choice | '') || '';
  const potTotal = room.stake * room.currentPlayers;
  const gameEnded = room.status === 'completed';
  const isWon = gameEnded && room.winnerId === currentUserId;
  const winnerName =
    room.winnerId && room.playerProfiles[room.winnerId]
      ? room.playerProfiles[room.winnerId].name
      : 'Champion';

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

  const handleChoice = async (choice: Choice) => {
    if (isSubmitting || gameEnded || myPendingChoice !== '') return;
    soundManager.playClick();
    setIsSubmitting(true);
    try {
      await submitRpsChoice({
        roomId: room.id,
        userId: currentUserId,
        choice,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const readyCount = room.playerIds.filter((uid) => Boolean(choices[uid])).length;

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
            <span>✂️</span> Rock Paper Scissors ({room.currentPlayers}-Player Arena)
          </h2>
          <p className="text-xs text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            Pot Stake: ₦{potTotal.toLocaleString()} · Lead with {TARGET_POINTS}+ pts to Win
          </p>
        </div>
        <div className="px-4 py-2 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-400 rounded-xl text-xs font-mono font-bold tabular-nums">
          Round {round} · {readyCount}/{room.currentPlayers} Locked
        </div>
      </div>

      {/* All Players Scoreboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {room.playerIds.map((uid) => {
          const profile = room.playerProfiles[uid];
          const score = typeof scores[uid] === 'number' ? scores[uid] : 0;
          const hasPending = Boolean(choices[uid]);
          const lastMove = lastChoices[uid] as Choice | '';
          const isMe = uid === currentUserId;
          const displayMoveIcon = isMe
            ? myPendingChoice
              ? CHOICES.find((c) => c.id === myPendingChoice)?.icon
              : lastMove
              ? CHOICES.find((c) => c.id === lastMove)?.icon
              : '❓'
            : hasPending
            ? '🤫'
            : lastMove
            ? CHOICES.find((c) => c.id === lastMove)?.icon
            : '⏳';

          return (
            <div
              key={uid}
              className={`p-3.5 rounded-2xl bg-white dark:bg-slate-900 border shadow-sm space-y-2.5 ${
                isMe
                  ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <img
                  src={profile?.avatar || room.hostAvatar}
                  alt={profile?.name || 'Player'}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {profile?.name || 'Player'}
                    {isMe ? ' (You)' : ''}
                  </p>
                  <p className="text-[11px] font-mono font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {score} pts
                  </p>
                </div>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-lg">{displayMoveIcon}</span>
                <span className="font-semibold text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  {hasPending ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Locked
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 text-slate-400" /> Choosing
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Area */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center shadow-xl dark:shadow-2xl space-y-6">
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-cyan-700 dark:text-cyan-300 text-xs sm:text-sm font-semibold text-center">
          {message}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-lg">
          All {room.currentPlayers} players pick simultaneously. You score +1 point for every opponent your move beats each round. Opponent moves remain hidden until everyone locks in.
        </p>

        <div className="flex gap-3 sm:gap-4 w-full max-w-md">
          {CHOICES.map((c) => {
            const selected = myPendingChoice === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => void handleChoice(c.id)}
                disabled={isSubmitting || gameEnded || myPendingChoice !== ''}
                className={`flex-1 py-5 rounded-2xl border font-bold text-sm shadow-md transition-all flex flex-col items-center gap-2 ${
                  selected
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-500/20 dark:border-emerald-400 dark:text-white scale-105'
                    : 'bg-gradient-to-b from-slate-50 to-slate-100 hover:from-white hover:to-slate-50 dark:from-slate-800 dark:to-slate-900 dark:hover:from-slate-700 dark:hover:to-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:scale-105 disabled:opacity-50'
                }`}
              >
                <span className="text-4xl">{c.icon}</span>
                <span>{c.name}</span>
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
