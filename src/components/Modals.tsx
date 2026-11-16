import React from 'react';
import { RotateCcw, Trophy, Skull, Play, Home } from 'lucide-react';
import { GameSettings, GraphicsQuality, MatchResult } from '../game/types';

interface PauseModalProps {
  settings: GameSettings;
  onUpdateSettings: (next: GameSettings) => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnLobby: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  settings,
  onUpdateSettings,
  onResume,
  onRestart,
  onReturnLobby,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/60 p-5 text-slate-100 shadow-2xl space-y-4">
        <div className="border-b border-slate-700 pb-2">
          <div className="text-xs font-bold tracking-widest text-amber-400">TACTICAL PAUSE</div>
          <h2 className="text-2xl font-black tracking-wider">MATCH PAUSED</h2>
        </div>

        <div className="space-y-2 text-xs">
          <div className="font-bold text-slate-300">Graphics Quality</div>
          <div className="grid grid-cols-4 gap-1.5">
            {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onUpdateSettings({ ...settings, graphics: q })}
                className={`py-1.5 font-bold uppercase border cursor-pointer ${
                  settings.graphics === q
                    ? 'bg-amber-500 text-slate-950 border-amber-300'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" /> RESUME MATCH
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> RESTART DROP
          </button>
          <button
            type="button"
            onClick={onReturnLobby}
            className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" /> RETURN TO LOBBY
          </button>
        </div>
      </div>
    </div>
  );
};

interface ResultModalProps {
  result: MatchResult;
  onPlayAgain: () => void;
  onReturnLobby: () => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  result,
  onPlayAgain,
  onReturnLobby,
}) => {
  const mins = Math.floor(result.survivalTime / 60);
  const secs = Math.floor(result.survivalTime % 60);
  const timeFormatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-4">
      <div
        className={`w-full max-w-lg bg-slate-900 border-2 p-6 text-slate-100 shadow-2xl space-y-5 ${
          result.victory ? 'border-amber-400' : 'border-red-500'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          {result.victory ? (
            <div className="p-2.5 bg-amber-500/20 border border-amber-400 text-amber-400">
              <Trophy className="w-7 h-7" />
            </div>
          ) : (
            <div className="p-2.5 bg-red-500/20 border border-red-500 text-red-400">
              <Skull className="w-7 h-7" />
            </div>
          )}
          <div>
            <div className="text-xs font-extrabold tracking-widest uppercase text-slate-400">
              RANK #{result.rank} / {result.totalCombatants} · {result.mode.toUpperCase()}
            </div>
            <h2
              className={`text-3xl font-black tracking-wider ${
                result.victory ? 'text-amber-400' : 'text-red-400'
              }`}
            >
              {result.victory ? 'ULTIMATE VICTORY!' : 'ELIMINATED'}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-950 border border-slate-800 p-3">
            <div className="text-[10px] font-bold tracking-widest text-slate-400">ELIMINATIONS</div>
            <div className="text-2xl font-black text-amber-400 tabular-nums">
              {result.eliminations}
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-3">
            <div className="text-[10px] font-bold tracking-widest text-slate-400">DAMAGE</div>
            <div className="text-2xl font-black text-white tabular-nums">{result.damageDealt}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-3">
            <div className="text-[10px] font-bold tracking-widest text-slate-400">SURVIVAL</div>
            <div className="text-2xl font-black text-sky-300 tabular-nums">{timeFormatted}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-3">
            <div className="text-[10px] font-bold tracking-widest text-slate-400">SCORE</div>
            <div className="text-2xl font-black text-emerald-400 tabular-nums">{result.score}</div>
          </div>
        </div>

        <div className="text-xs font-bold tracking-wider text-slate-400 flex justify-between">
          <span>CAREER BEST SCORE</span>
          <span className="text-amber-300 tabular-nums">{result.bestScore}</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black tracking-widest uppercase cursor-pointer"
          >
            PLAY AGAIN
          </button>
          <button
            type="button"
            onClick={onReturnLobby}
            className="px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold tracking-wider uppercase cursor-pointer"
          >
            LOBBY
          </button>
        </div>
      </div>
    </div>
  );
};
