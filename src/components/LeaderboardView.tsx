import { Trophy, Medal, Award, TrendingUp, Users } from 'lucide-react';
import { LeaderboardEntry } from '../types';

interface LeaderboardViewProps {
  entries: LeaderboardEntry[];
  isAuthenticated: boolean;
}

export function LeaderboardView({ entries, isAuthenticated }: LeaderboardViewProps) {
  const sorted = [...entries].sort((a, b) => b.balance - a.balance);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in py-6 px-4">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500 dark:text-amber-400" />
            Global Hall of Fame
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live rankings of real registered players across all BetArena matches
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Real Players Only</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-2 shadow-sm">
          <Users className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {isAuthenticated ? 'No player rankings recorded yet.' : 'Sign in to view live player rankings.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Rankings update automatically as real players register and complete matches.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg dark:shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-4 px-6">Rank</th>
                  <th className="py-4 px-6">Player</th>
                  <th className="py-4 px-6 text-right">Net Worth (NGN ₦)</th>
                  <th className="py-4 px-6 text-right">Wins</th>
                  <th className="py-4 px-6 text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {sorted.map((entry, idx) => {
                  const rank = idx + 1;
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-4 px-6 font-mono font-bold">
                        {rank === 1 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
                            🥇
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-400/20 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-400/30">
                            🥈
                          </span>
                        ) : rank === 3 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-700/20 text-amber-700 dark:text-amber-600 border border-amber-300 dark:border-amber-700/30">
                            🥉
                          </span>
                        ) : (
                          <span className="text-slate-500 pl-2">#{rank}</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <img
                            src={entry.avatar}
                            alt={entry.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 object-cover border border-slate-300 dark:border-slate-700"
                          />
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              {entry.name}
                              {rank <= 3 && <Medal className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />}
                            </p>
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                              <Award className="w-3 h-3" /> {entry.title}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        ₦{entry.balance.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-slate-900 dark:text-white tabular-nums">
                        {entry.wins}
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-cyan-600 dark:text-cyan-400 tabular-nums">
                        {entry.winRate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
