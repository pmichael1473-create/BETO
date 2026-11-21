import { X, BookOpen, HelpCircle, Sparkles } from 'lucide-react';
import { GameType } from '../types';
import { soundManager } from '../utils/audio';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameType: GameType;
}

const TUTORIAL_CONTENT: Record<GameType, { title: string; rules: string[]; controls: string[] }> = {
  whot: {
    title: 'Whot! African Card Game Rules',
    rules: [
      '2 to 6 players take turns matching cards by identical Shape or identical Number.',
      'If you have no matching card, click Draw Deck to take a card and pass the turn.',
      'First player to empty their entire hand wins the full multiplayer pot!',
    ],
    controls: [
      'Click any valid card in your hand on your turn to play it to the center discard pile.',
      'Click the Draw Deck if you have no matching cards.',
    ],
  },
  checkers: {
    title: 'Checkers (Draughts) Bracket Rules',
    rules: [
      '2 to 6 players compete in a live head-to-head knockout bracket inside the room.',
      'Pieces move diagonally forward on dark squares and jump opponent pieces to capture.',
      'Reach the opposite end to crown your piece into a King (moves forward and backward).',
      'Bracket winners advance to the Final to claim the full room pot!',
    ],
    controls: [
      'When your bracket duel is active, click one of your pieces to select it.',
      'Click a valid diagonal square to move or capture.',
    ],
  },
  rps: {
    title: 'Rock Paper Scissors Group Arena',
    rules: [
      'All 2 to 6 seated players lock in Rock, Paper, or Scissors simultaneously each round.',
      'You earn +1 point for every opponent in the round whose move yours defeats.',
      'First player to lead with 6 or more points claims the full multiplayer pot!',
    ],
    controls: [
      'Click Rock ✊, Paper ✋, or Scissors ✌️ to lock in your move while other choices stay hidden.',
    ],
  },
  tictactoe: {
    title: 'X and O (5x5 Grid) Rules',
    rules: [
      '2 to 6 players take turns placing their unique symbol on a 5x5 tactical grid.',
      'First player to align 3 of their symbols horizontally, vertically, or diagonally wins the pot!',
    ],
    controls: [
      'Click any empty square on the 5x5 grid when it is your turn.',
    ],
  },
  memory: {
    title: 'Memory Match Pro Rules',
    rules: [
      '2 to 6 players take turns flipping two face-down cards on the 18-card board.',
      'Matching a pair scores 1 point and grants a bonus turn!',
      'Once all 9 pairs are matched (or a player reaches an insurmountable 5 pairs), the top scorer wins the pot.',
    ],
    controls: [
      'Click any two face-down cards on your turn to reveal them.',
      'Watch every opponent flip closely to memorize card locations.',
    ],
  },
};

export function TutorialModal({ isOpen, onClose, gameType }: TutorialModalProps) {
  if (!isOpen) return null;
  const content = TUTORIAL_CONTENT[gameType] || TUTORIAL_CONTENT.whot;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-500/10 rounded-xl text-cyan-600 dark:text-cyan-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{content.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Rules & Gameplay Guide</p>
            </div>
          </div>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-slate-700 dark:text-slate-300">
          <div className="space-y-3">
            <h4 className="font-bold flex items-center gap-2 text-xs uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              <HelpCircle className="w-4 h-4" /> Game Rules
            </h4>
            <ul className="space-y-2 list-disc list-inside text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {content.rules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h4 className="font-bold flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-4 h-4" /> Controls & How to Play
            </h4>
            <ul className="space-y-2 list-disc list-inside text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {content.controls.map((ctrl, i) => (
                <li key={i}>{ctrl}</li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 text-white font-bold rounded-xl text-xs shadow-lg transition-all"
          >
            Got it, Let's Play!
          </button>
        </div>
      </div>
    </div>
  );
}
