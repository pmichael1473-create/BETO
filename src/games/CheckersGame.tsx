import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Trophy, RotateCcw, HelpCircle, Swords } from 'lucide-react';
import { GameRoom } from '../types';
import { createInitialCheckersBoardFlat } from '../firebase';
import { soundManager } from '../utils/audio';
import confetti from 'canvas-confetti';
import { TutorialModal } from '../components/TutorialModal';

interface CheckersGameProps {
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

type Piece = { player: 1 | 2; king: boolean } | null;

function flatToBoard(flat: number[]): Piece[][] {
  const board: Piece[][] = [];
  for (let r = 0; r < 8; r++) {
    const row: Piece[] = [];
    for (let c = 0; c < 8; c++) {
      const code = flat[r * 8 + c] ?? 0;
      if (code === 1) row.push({ player: 1, king: false });
      else if (code === 2) row.push({ player: 1, king: true });
      else if (code === 3) row.push({ player: 2, king: false });
      else if (code === 4) row.push({ player: 2, king: true });
      else row.push(null);
    }
    board.push(row);
  }
  return board;
}

function boardToFlat(board: Piece[][]): number[] {
  const flat: number[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) flat.push(0);
      else if (p.player === 1) flat.push(p.king ? 2 : 1);
      else flat.push(p.king ? 4 : 3);
    }
  }
  return flat;
}

function hasLegalMoves(board: Piece[][], player: 1 | 2): boolean {
  for (let sr = 0; sr < 8; sr++) {
    for (let sc = 0; sc < 8; sc++) {
      const p = board[sr][sc];
      if (!p || p.player !== player) continue;
      const dirs = p.king ? [-1, 1] : player === 1 ? [-1] : [1];
      for (const rd of dirs) {
        for (const cd of [-1, 1]) {
          const dr = sr + rd;
          const dc = sc + cd;
          if (dr >= 0 && dr < 8 && dc >= 0 && dc < 8) {
            if (board[dr][dc] === null) return true;
            const jdr = sr + rd * 2;
            const jdc = sc + cd * 2;
            if (
              jdr >= 0 &&
              jdr < 8 &&
              jdc >= 0 &&
              jdc < 8 &&
              board[jdr][jdc] === null &&
              board[dr][dc]?.player === (player === 1 ? 2 : 1)
            ) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

export function CheckersGame({
  room,
  currentUserId,
  onUpdateMatch,
  onGameOver,
  onBack,
}: CheckersGameProps) {
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const settledRef = useRef(false);

  const gs = room.gameState || {};
  const boardFlat =
    Array.isArray(gs.boardFlat) && gs.boardFlat.length === 64
      ? (gs.boardFlat as number[])
      : createInitialCheckersBoardFlat();
  const board = flatToBoard(boardFlat);
  const turn: 1 | 2 = gs.turn === 2 ? 2 : 1;
  const bracketRound = typeof gs.bracketRound === 'number' ? gs.bracketRound : 1;
  const currentPair = Array.isArray(gs.currentPair)
    ? (gs.currentPair as string[])
    : [room.playerIds[0] || '', room.playerIds[1] || ''];
  const queueIds = Array.isArray(gs.queueIds) ? (gs.queueIds as string[]) : [];
  const roundWinners = Array.isArray(gs.roundWinners) ? (gs.roundWinners as string[]) : [];
  const eliminatedIds = Array.isArray(gs.eliminatedIds) ? (gs.eliminatedIds as string[]) : [];

  const p1Uid = currentPair[0] || '';
  const p2Uid = currentPair[1] || '';
  const p1Name = room.playerProfiles[p1Uid]?.name || 'Player 1';
  const p2Name = room.playerProfiles[p2Uid]?.name || 'Player 2';

  const myPlayer: 1 | 2 | 0 = currentUserId === p1Uid ? 1 : currentUserId === p2Uid ? 2 : 0;
  const potTotal = room.stake * room.currentPlayers;

  const message =
    typeof gs.message === 'string' && gs.message
      ? gs.message
      : `Round ${bracketRound}: ${p1Name} (Red) vs ${p2Name} (Black)`;

  const gameEnded = room.status === 'completed';
  const isWon = gameEnded && room.winnerId === currentUserId;
  const isMyTurn = !gameEnded && myPlayer !== 0 && turn === myPlayer;

  useEffect(() => {
    setSelectedPos(null);
  }, [p1Uid, p2Uid, bracketRound]);

  useEffect(() => {
    if (room.status === 'completed' && !settledRef.current) {
      settledRef.current = true;
      if (room.winnerId === currentUserId) {
        soundManager.playWin();
        confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
        onGameOver(true, potTotal, false);
      } else {
        soundManager.playClick();
        onGameOver(false, 0, false);
      }
    }
  }, [room.status, room.winnerId, potTotal, currentUserId, onGameOver]);

  const isLegalMove = (sr: number, sc: number, dr: number, dc: number) => {
    if (board[dr][dc] !== null) return false;
    const piece = board[sr][sc];
    if (!piece || piece.player !== myPlayer) return false;

    const rowDiff = dr - sr;
    const colDiff = Math.abs(dc - sc);

    if (!piece.king) {
      if (piece.player === 1 && rowDiff !== -1 && rowDiff !== -2) return false;
      if (piece.player === 2 && rowDiff !== 1 && rowDiff !== 2) return false;
    } else {
      if (Math.abs(rowDiff) !== 1 && Math.abs(rowDiff) !== 2) return false;
    }

    if (colDiff === 1 && Math.abs(rowDiff) === 1) return true;

    if (colDiff === 2 && Math.abs(rowDiff) === 2) {
      const midR = (sr + dr) / 2;
      const midC = (sc + dc) / 2;
      const midPiece = board[midR][midC];
      if (midPiece && midPiece.player !== piece.player) return true;
    }

    return false;
  };

  const executeMove = async (sr: number, sc: number, dr: number, dc: number) => {
    if (isSubmitting || !isMyTurn) return;
    soundManager.playCardFlip();
    setIsSubmitting(true);

    try {
      const newBoard = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
      const piece = newBoard[sr][sc];
      if (!piece) return;
      newBoard[sr][sc] = null;

      if (piece.player === 1 && dr === 0) piece.king = true;
      if (piece.player === 2 && dr === 7) piece.king = true;

      newBoard[dr][dc] = piece;

      if (Math.abs(dr - sr) === 2) {
        const midR = (sr + dr) / 2;
        const midC = (sc + dc) / 2;
        newBoard[midR][midC] = null;
      }

      const opponent: 1 | 2 = myPlayer === 1 ? 2 : 1;
      const oppPieces = newBoard.flat().filter((p) => p?.player === opponent).length;
      const oppHasMoves = hasLegalMoves(newBoard, opponent);

      const nextFlat = boardToFlat(newBoard);

      if (oppPieces === 0 || !oppHasMoves) {
        const duelWinner = myPlayer === 1 ? p1Uid : p2Uid;
        const duelLoser = myPlayer === 1 ? p2Uid : p1Uid;
        const duelWinnerName = room.playerProfiles[duelWinner]?.name || 'Winner';

        const nextEliminated = [...eliminatedIds, duelLoser];
        let nextWinners = [...roundWinners, duelWinner];

        if (queueIds.length >= 2) {
          const nextPair = [queueIds[0], queueIds[1]];
          const nextQueue = queueIds.slice(2);
          const n1 = room.playerProfiles[nextPair[0]]?.name || 'Player A';
          const n2 = room.playerProfiles[nextPair[1]]?.name || 'Player B';
          await onUpdateMatch(
            {
              boardFlat: createInitialCheckersBoardFlat(),
              turn: 1,
              bracketRound,
              currentPair: nextPair,
              queueIds: nextQueue,
              roundWinners: nextWinners,
              eliminatedIds: nextEliminated,
              message: `${duelWinnerName} advances! Next up: ${n1} (Red) vs ${n2} (Black).`,
            },
            'in_progress',
            ''
          );
        } else {
          if (queueIds.length === 1) {
            nextWinners = [...nextWinners, queueIds[0]];
          }
          if (nextWinners.length <= 1) {
            const champUid = nextWinners[0] || duelWinner;
            const champName = room.playerProfiles[champUid]?.name || duelWinnerName;
            await onUpdateMatch(
              {
                boardFlat: nextFlat,
                turn: myPlayer,
                bracketRound,
                currentPair,
                queueIds: [],
                roundWinners: nextWinners,
                eliminatedIds: nextEliminated,
                message: `${champName} is the Checkers Champion and wins the pot!`,
              },
              'completed',
              champUid
            );
          } else {
            const nextPair = [nextWinners[0], nextWinners[1]];
            const nextQueue = nextWinners.slice(2);
            const n1 = room.playerProfiles[nextPair[0]]?.name || 'Finalist 1';
            const n2 = room.playerProfiles[nextPair[1]]?.name || 'Finalist 2';
            const roundLabel = nextWinners.length === 2 ? 'Grand Final' : `Round ${bracketRound + 1}`;
            await onUpdateMatch(
              {
                boardFlat: createInitialCheckersBoardFlat(),
                turn: 1,
                bracketRound: bracketRound + 1,
                currentPair: nextPair,
                queueIds: nextQueue,
                roundWinners: [],
                eliminatedIds: nextEliminated,
                message: `${duelWinnerName} advances! ${roundLabel}: ${n1} (Red) vs ${n2} (Black)!`,
              },
              'in_progress',
              ''
            );
          }
        }
      } else {
        const nextName = opponent === 1 ? p1Name : p2Name;
        const colorLabel = opponent === 1 ? 'Red' : 'Black';
        await onUpdateMatch(
          {
            boardFlat: nextFlat,
            turn: opponent,
            bracketRound,
            currentPair,
            queueIds,
            roundWinners,
            eliminatedIds,
            message: `Round ${bracketRound}: ${nextName}'s turn (${colorLabel} pieces).`,
          },
          'in_progress',
          ''
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSquareClick = (r: number, c: number) => {
    if (!isMyTurn || isSubmitting || gameEnded) return;

    const piece = board[r][c];
    if (selectedPos) {
      const [sr, sc] = selectedPos;
      if (isLegalMove(sr, sc, r, c)) {
        setSelectedPos(null);
        void executeMove(sr, sc, r, c);
      } else if (piece && piece.player === myPlayer) {
        setSelectedPos([r, c]);
        soundManager.playClick();
      } else {
        setSelectedPos(null);
      }
    } else if (piece && piece.player === myPlayer) {
      setSelectedPos([r, c]);
      soundManager.playClick();
    }
  };

  const championName =
    room.winnerId && room.playerProfiles[room.winnerId]
      ? room.playerProfiles[room.winnerId].name
      : 'Champion';

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6 animate-fade-in font-sans">
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-4 shadow-lg flex-wrap gap-3">
        <button
          onClick={() => {
            soundManager.playClick();
            onBack();
          }}
          className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Leave Arena
        </button>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
            <span>🔴</span> Checkers ({room.currentPlayers}-Player Bracket Arena)
          </h2>
          <p className="text-xs text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            Pot Stake: ₦{potTotal.toLocaleString()} · Round {bracketRound}
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
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border ${
              isMyTurn
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400'
            }`}
          >
            {gameEnded
              ? 'Bracket Complete'
              : myPlayer === 0
              ? 'Spectating Duel'
              : isMyTurn
              ? 'Your Turn'
              : "Opponent's Turn"}
          </div>
        </div>
      </div>

      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        gameType="checkers"
      />

      {/* Seated Bracket Roster */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {room.playerIds.map((uid) => {
          const profile = room.playerProfiles[uid];
          const isMe = uid === currentUserId;
          const isEliminated = eliminatedIds.includes(uid);
          const isP1 = uid === p1Uid;
          const isP2 = uid === p2Uid;
          const hasAdvanced = roundWinners.includes(uid);
          const statusLabel = isEliminated
            ? 'Eliminated'
            : isP1
            ? 'Playing · Red'
            : isP2
            ? 'Playing · Black'
            : hasAdvanced
            ? 'Advanced'
            : 'Up Next';

          return (
            <div
              key={uid}
              className={`p-3 rounded-2xl bg-white dark:bg-slate-900 border flex items-center gap-2.5 ${
                isEliminated
                  ? 'opacity-50 border-slate-200 dark:border-slate-800'
                  : isP1 || isP2
                  ? 'border-emerald-500 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <img
                src={profile?.avatar || room.hostAvatar}
                alt={profile?.name || 'Player'}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-slate-300 dark:border-slate-700 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                  {profile?.name || 'Player'}
                  {isMe ? ' (You)' : ''}
                </p>
                <p className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                  {statusLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Match Pair */}
      <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
        <div
          className={`p-3.5 rounded-2xl bg-white dark:bg-slate-900 border flex items-center gap-3 ${
            !gameEnded && turn === 1
              ? 'border-rose-500 shadow-md'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <img
            src={room.playerProfiles[p1Uid]?.avatar || room.hostAvatar}
            alt={p1Name}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover border border-rose-500 bg-slate-200 dark:bg-slate-800 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
              RED {p1Uid === currentUserId ? '(You)' : ''}
            </p>
            <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
              {p1Name}
            </p>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl bg-white dark:bg-slate-900 border flex items-center gap-3 ${
            !gameEnded && turn === 2
              ? 'border-cyan-500 shadow-md'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <img
            src={room.playerProfiles[p2Uid]?.avatar || room.hostAvatar}
            alt={p2Name}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover border border-slate-500 bg-slate-200 dark:bg-slate-800 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              BLACK {p2Uid === currentUserId ? '(You)' : ''}
            </p>
            <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
              {p2Name}
            </p>
          </div>
        </div>
      </div>

      <div className="relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex flex-col items-center shadow-xl dark:shadow-2xl space-y-6">
        <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 bg-slate-50 dark:bg-slate-950 px-6 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs text-center flex items-center gap-2">
          <Swords className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </p>

        <div className="w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] grid grid-cols-8 border-4 border-amber-900/40 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xl">
          {board.map((row, r) =>
            row.map((piece, c) => {
              const isDark = (r + c) % 2 === 1;
              const isSelected = selectedPos && selectedPos[0] === r && selectedPos[1] === c;
              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleSquareClick(r, c)}
                  className={`flex items-center justify-center transition-colors ${
                    isMyTurn ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isDark ? 'bg-amber-950/90 hover:bg-amber-900/90' : 'bg-amber-100'
                  } ${isSelected ? 'ring-4 ring-emerald-400 z-10' : ''}`}
                >
                  {piece && (
                    <div
                      className={`w-4/5 h-4/5 rounded-full flex items-center justify-center shadow-lg transform transition-transform ${
                        piece.player === 1
                          ? 'bg-gradient-to-tr from-rose-600 to-red-500 border-2 border-rose-300 text-white'
                          : 'bg-gradient-to-tr from-slate-900 to-slate-800 border-2 border-slate-500 text-slate-300'
                      } ${isMyTurn && piece.player === myPlayer ? 'hover:scale-105' : ''}`}
                    >
                      {piece.king ? (
                        <CrownIcon className="w-5 h-5 text-amber-300" />
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-white/20" />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
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
                {isWon ? 'Champion! Pot Won!' : 'Bracket Complete'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                {isWon
                  ? `You won ₦${potTotal.toLocaleString()} from the ${room.currentPlayers}-player bracket.`
                  : `${championName} won the Checkers bracket.`}
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

function CrownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="currentColor" viewBox="0 0 24 24">
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5m14 3a1 1 0 01-1 1H6a1 1 0 01-1-1v-1h14v1z" />
    </svg>
  );
}
